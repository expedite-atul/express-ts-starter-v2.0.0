import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEV_PASSWORD } from '../../seeds/development-data.ts';
import { bearer, createTestContext, login, refreshCookieFrom, type TestContext } from '../helpers/test-app.ts';

const EMPLOYEE = 'employee@example.com';

describe('authentication and sessions', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  const refresh = (cookie: string) => request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', cookie);
  const me = (token: string) => request(ctx.app).get('/api/v1/employees/me').set(bearer(token));

  describe('login', () => {
    it('succeeds with valid credentials and sets an HttpOnly, SameSite=Strict refresh cookie', async () => {
      const response = await request(ctx.app)
        .post('/api/v1/auth/login')
        .send({ email: EMPLOYEE, password: DEV_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900, user: { email: EMPLOYEE, role: 'employee' } });
      const cookie = (response.headers['set-cookie'] as unknown as string[]).join(';');
      expect(cookie).toMatch(/refresh_token=/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      // The refresh token is only in the cookie, never in the JSON body.
      expect(JSON.stringify(response.body)).not.toContain(refreshCookieFrom(response).split('=')[1]);
    });

    it('rejects a wrong password and an unknown email with the SAME generic error', async () => {
      const wrongPassword = await request(ctx.app).post('/api/v1/auth/login').send({ email: EMPLOYEE, password: 'wrong-password' });
      const unknownEmail = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password' });

      for (const response of [wrongPassword, unknownEmail]) {
        expect(response.status).toBe(401);
        expect(response.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
        expect(response.headers['set-cookie']).toBeUndefined();
      }
    });

    it('never returns a password hash from any endpoint', async () => {
      const admin = await login(ctx.app, 'admin@example.com');
      const employee = await login(ctx.app, EMPLOYEE);
      const responses = await Promise.all([
        me(employee.accessToken),
        request(ctx.app).get('/api/v1/employees/me/export').set(bearer(employee.accessToken)),
        request(ctx.app).get('/api/v1/auth/sessions').set(bearer(employee.accessToken)),
        request(ctx.app).get('/api/v1/employees?pageSize=100').set(bearer(admin.accessToken)),
        request(ctx.app).get(`/api/v1/employees/${ctx.ids.employees.employee}`).set(bearer(admin.accessToken)),
        request(ctx.app)
          .patch(`/api/v1/users/${ctx.ids.users.employee2}/role`)
          .set(bearer(admin.accessToken))
          .send({ role: 'manager' }),
      ]);

      for (const response of [...responses, { status: 200, text: JSON.stringify(admin.body) }]) {
        expect(response.status).toBe(200);
        expect(response.text).not.toMatch(/\$argon2/);
        expect(response.text).not.toMatch(/password_?hash/i);
      }
    });
  });

  describe('refresh-token rotation', () => {
    it('rotates the refresh token on every use', async () => {
      const session = await login(ctx.app, EMPLOYEE);
      const first = await refresh(session.refreshCookie);
      expect(first.status).toBe(200);
      const rotated = refreshCookieFrom(first);
      expect(rotated).not.toBe(session.refreshCookie);

      const second = await refresh(rotated);
      expect(second.status).toBe(200);
      expect(await me(second.body.accessToken as string)).toHaveProperty('status', 200);
    });

    it('detects reuse of a rotated token and revokes the whole session (token family)', async () => {
      const session = await login(ctx.app, EMPLOYEE);
      const rotated = refreshCookieFrom(await refresh(session.refreshCookie));

      // Replay the old token: rejected...
      const replay = await refresh(session.refreshCookie);
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');

      // ...and the session is gone for everyone: the new token and the access token too.
      expect((await refresh(rotated)).status).toBe(401);
      expect((await me(session.accessToken)).status).toBe(401);

      const audit: { action: string }[] = await ctx.dataSource.query(
        `SELECT action FROM audit_logs WHERE action = 'session.reuse_detected'`,
      );
      expect(audit).toHaveLength(1);
    });

    it('rejects a missing or made-up refresh token', async () => {
      expect((await request(ctx.app).post('/api/v1/auth/refresh')).status).toBe(401);
      expect((await refresh('refresh_token=made-up')).status).toBe(401);
    });
  });

  describe('logout', () => {
    it('logout revokes only the current session', async () => {
      const laptop = await login(ctx.app, EMPLOYEE);
      const phone = await login(ctx.app, EMPLOYEE);

      const response = await request(ctx.app).post('/api/v1/auth/logout').set('Cookie', laptop.refreshCookie);
      expect(response.status).toBe(204);

      expect((await refresh(laptop.refreshCookie)).status).toBe(401);
      expect((await me(laptop.accessToken)).status).toBe(401); // access token stops working at once
      expect((await me(phone.accessToken)).status).toBe(200); // the other session is untouched
    });

    it('logout-all revokes every session of the user', async () => {
      const laptop = await login(ctx.app, EMPLOYEE);
      const phone = await login(ctx.app, EMPLOYEE);

      const response = await request(ctx.app).post('/api/v1/auth/logout-all').set(bearer(laptop.accessToken));
      expect(response.status).toBe(204);

      for (const session of [laptop, phone]) {
        expect((await me(session.accessToken)).status).toBe(401);
        expect((await refresh(session.refreshCookie)).status).toBe(401);
      }
    });
  });

  describe('sessions', () => {
    it('lists active sessions and marks the current one', async () => {
      await login(ctx.app, EMPLOYEE);
      const current = await login(ctx.app, EMPLOYEE);
      const response = await request(ctx.app).get('/api/v1/auth/sessions').set(bearer(current.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    });

    it('revokes one of your own sessions, but not someone else’s', async () => {
      const mine = await login(ctx.app, EMPLOYEE);
      const other = await login(ctx.app, EMPLOYEE);
      const someoneElse = await login(ctx.app, 'employee2@example.com');
      const sessions = await request(ctx.app).get('/api/v1/auth/sessions').set(bearer(mine.accessToken));
      const otherId = (sessions.body.items as { id: string; current: boolean }[]).find((s) => !s.current)?.id;

      const revoke = await request(ctx.app).delete(`/api/v1/auth/sessions/${otherId}`).set(bearer(mine.accessToken));
      expect(revoke.status).toBe(204);
      expect((await me(other.accessToken)).status).toBe(401);

      const theirs = await request(ctx.app).get('/api/v1/auth/sessions').set(bearer(someoneElse.accessToken));
      const theirId = (theirs.body.items as { id: string }[])[0]?.id;
      const attempt = await request(ctx.app).delete(`/api/v1/auth/sessions/${theirId}`).set(bearer(mine.accessToken));
      expect(attempt.status).toBe(404);
      expect((await me(someoneElse.accessToken)).status).toBe(200);
    });
  });

  describe('change password', () => {
    it('changes the password and revokes every session', async () => {
      const session = await login(ctx.app, EMPLOYEE);
      const newPassword = 'A-much-longer-new-passphrase';

      const response = await request(ctx.app)
        .post('/api/v1/auth/change-password')
        .set(bearer(session.accessToken))
        .send({ currentPassword: DEV_PASSWORD, newPassword });
      expect(response.status).toBe(204);

      expect((await me(session.accessToken)).status).toBe(401);
      expect((await refresh(session.refreshCookie)).status).toBe(401);
      expect((await request(ctx.app).post('/api/v1/auth/login').send({ email: EMPLOYEE, password: DEV_PASSWORD })).status).toBe(401);
      expect((await login(ctx.app, EMPLOYEE, newPassword)).accessToken).toBeTruthy();
    });

    it('requires the correct current password and a policy-compliant new one', async () => {
      const session = await login(ctx.app, EMPLOYEE);
      const wrongCurrent = await request(ctx.app)
        .post('/api/v1/auth/change-password')
        .set(bearer(session.accessToken))
        .send({ currentPassword: 'not-my-password', newPassword: 'A-much-longer-new-passphrase' });
      expect(wrongCurrent.status).toBe(400);

      const tooShort = await request(ctx.app)
        .post('/api/v1/auth/change-password')
        .set(bearer(session.accessToken))
        .send({ currentPassword: DEV_PASSWORD, newPassword: 'short' });
      expect(tooShort.status).toBe(400);
      expect(tooShort.body.error.details[0].path).toBe('body.newPassword');
    });
  });
});

describe('login rate limiting', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext({ AUTH_RATE_LIMIT_MAX_REQUESTS: '3' });
    await ctx.reset();
  });
  afterAll(() => ctx.close());

  it('blocks repeated failed login attempts with 429', async () => {
    const attempt = () =>
      request(ctx.app).post('/api/v1/auth/login').send({ email: EMPLOYEE, password: 'guess' });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['x-request-id']).toBeTruthy();
    expect(blocked.headers.ratelimit).toBeTruthy();

    // Even the right password is refused until the window passes.
    const correct = await request(ctx.app).post('/api/v1/auth/login').send({ email: EMPLOYEE, password: DEV_PASSWORD });
    expect(correct.status).toBe(429);
  });
});
