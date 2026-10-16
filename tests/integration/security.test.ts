import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_PASSWORD } from '../../seeds/development-data.ts';
import { bearer, createTestContext, login, type TestContext } from '../helpers/test-app.ts';
import { TRUSTED_ORIGIN } from '../helpers/test-config.ts';

describe('API security', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  describe('CORS', () => {
    it('allows the configured origin', async () => {
      const response = await request(ctx.app).get('/health').set('Origin', TRUSTED_ORIGIN);
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(TRUSTED_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('rejects an untrusted origin, for simple and preflight requests', async () => {
      const simple = await request(ctx.app)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://evil.example')
        .send({ email: 'employee@example.com', password: DEV_PASSWORD });
      expect(simple.status).toBe(403);
      expect(simple.headers['access-control-allow-origin']).toBeUndefined();
      expect(simple.headers['set-cookie']).toBeUndefined();

      const preflight = await request(ctx.app)
        .options('/api/v1/employees')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'PATCH');
      expect(preflight.status).toBe(403);
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('security headers (Helmet)', () => {
    it('sets protective headers and hides the framework', async () => {
      const response = await request(ctx.app).get('/health');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('marks API responses as not cacheable', async () => {
      const { accessToken } = await login(ctx.app, 'employee@example.com');
      const response = await request(ctx.app).get('/api/v1/employees/me').set(bearer(accessToken));
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('errors', () => {
    it('handles unexpected failures centrally without exposing stack traces or internals', async () => {
      const { accessToken } = await login(ctx.app, 'employee@example.com');
      const failure = new Error('connection to db-internal.corp:5432 failed for user app_rw');
      const spy = vi.spyOn(ctx.services.departments, 'list').mockRejectedValueOnce(failure);

      const response = await request(ctx.app).get('/api/v1/departments').set(bearer(accessToken));
      spy.mockRestore();

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          requestId: response.headers['x-request-id'],
        },
      });
      expect(response.text).not.toContain('db-internal');
      expect(response.text).not.toMatch(/at .*\.ts:\d+/); // no stack frames

      // ...but the details ARE logged, with the request id, for the operators.
      const logged = ctx.logs.find((line) => line.includes('unhandled error'));
      expect(logged).toContain(response.headers['x-request-id']);
      expect(logged).toContain('db-internal');
    });

    it('returns 404 JSON for unknown routes', async () => {
      for (const path of ['/api/v1/unknown', '/api/v2/employees', '/nope']) {
        const response = await request(ctx.app).get(path);
        expect(response.status).toBe(404);
        expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Route not found' });
      }
    });

    it('returns structured 400s for invalid bodies', async () => {
      const empty = await request(ctx.app).post('/api/v1/auth/login').send({});
      expect(empty.status).toBe(400);
      expect(empty.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [
          { path: 'body.email', message: expect.any(String) },
          { path: 'body.password', message: expect.any(String) },
        ],
      });

      const malformed = await request(ctx.app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": ');
      expect(malformed.status).toBe(400);
      expect(malformed.body.error.message).toBe('The request body is not valid JSON');
    });

    it('accepts only JSON bodies, and only up to 100 KB', async () => {
      const text = await request(ctx.app).post('/api/v1/auth/login').set('Content-Type', 'text/plain').send('hello');
      expect(text.status).toBe(415);

      const huge = await request(ctx.app)
        .post('/api/v1/auth/login')
        .send({ email: 'a@example.com', password: 'x'.repeat(200 * 1024) });
      expect(huge.status).toBe(413);
    });
  });

  describe('request ids', () => {
    it('adds X-Request-Id to every response, success or error', async () => {
      const { accessToken } = await login(ctx.app, 'employee@example.com');
      const responses = await Promise.all([
        request(ctx.app).get('/health'),
        request(ctx.app).get('/api/v1/employees/me').set(bearer(accessToken)),
        request(ctx.app).get('/api/v1/employees/me'),
        request(ctx.app).get('/api/v1/employees').set(bearer(accessToken)),
        request(ctx.app).get('/api/v1/nope'),
        request(ctx.app).post('/api/v1/auth/login').send({}),
      ]);
      expect(responses.map((r) => r.status)).toEqual([200, 200, 401, 403, 404, 400]);
      for (const response of responses) {
        expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      }
    });

    it('keeps a safe caller-supplied id and replaces an unsafe one', async () => {
      const safe = await request(ctx.app).get('/health').set('X-Request-Id', 'trace-abc_123');
      expect(safe.headers['x-request-id']).toBe('trace-abc_123');
      for (const unsafeId of ['<script>alert(1)</script>', 'id with spaces', 'a'.repeat(65)]) {
        const unsafe = await request(ctx.app).get('/health').set('X-Request-Id', unsafeId);
        expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      }
    });
  });

  describe('logging', () => {
    it('never logs passwords, access tokens or refresh tokens', async () => {
      const session = await login(ctx.app, 'employee@example.com');
      const refreshed = await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', session.refreshCookie);
      await request(ctx.app).get('/api/v1/employees/me').set(bearer(session.accessToken));
      await request(ctx.app)
        .post('/api/v1/auth/change-password')
        .set(bearer(refreshed.body.accessToken as string))
        .send({ currentPassword: DEV_PASSWORD, newPassword: 'Brand-new-passphrase-2026' });
      await request(ctx.app).post('/api/v1/auth/login').send({ email: 'employee@example.com', password: 'wrong-password-123' });

      const allLogs = ctx.logs.join('\n');
      expect(ctx.logs.length).toBeGreaterThan(0);
      for (const secret of [
        DEV_PASSWORD,
        'Brand-new-passphrase-2026',
        'wrong-password-123',
        session.accessToken,
        refreshed.body.accessToken as string,
        session.refreshCookie.split('=')[1] as string,
      ]) {
        expect(allLogs).not.toContain(secret);
      }
    });
  });

  describe('deactivated users', () => {
    it('cannot keep using their sessions or log in again', async () => {
      const victim = await login(ctx.app, 'employee2@example.com');
      const admin = await login(ctx.app, 'admin@example.com');

      const deactivate = await request(ctx.app)
        .delete(`/api/v1/employees/${ctx.ids.employees.employee2}`)
        .set(bearer(admin.accessToken));
      expect(deactivate.status).toBe(204);

      expect((await request(ctx.app).get('/api/v1/employees/me').set(bearer(victim.accessToken))).status).toBe(401);
      expect((await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', victim.refreshCookie)).status).toBe(401);
      const relogin = await request(ctx.app)
        .post('/api/v1/auth/login')
        .send({ email: 'employee2@example.com', password: DEV_PASSWORD });
      expect(relogin.status).toBe(401);
      expect(relogin.body.error.code).toBe('INVALID_CREDENTIALS'); // no hint that the account exists
    });
  });
});
