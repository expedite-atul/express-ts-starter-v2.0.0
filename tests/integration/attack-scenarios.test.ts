/**
 * The three attacks from the assignment's "final challenge", in one place for the demo.
 * Each test shows the request, the response, and names the control that stops it
 * (details in docs/security-report.md).
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createTestContext, login, refreshCookieFrom, type TestContext } from '../helpers/test-app.ts';

describe('final challenge: attack scenarios fail safely', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  it('1. privilege escalation with a crafted body is rejected', async () => {
    const employee = await login(ctx.app, 'employee@example.com');
    // Control: strict request schema (validators/employee.validators.ts) rejects unknown fields.
    const selfPromotion = await request(ctx.app)
      .patch('/api/v1/employees/me')
      .set(bearer(employee.accessToken))
      .send({ role: 'admin' });
    expect(selfPromotion.status).toBe(400);
    expect(selfPromotion.body.error.details).toContainEqual({ path: 'body.role', message: 'is not an allowed field' });

    const hr = await login(ctx.app, 'hr@example.com');
    // Control: requireRole('admin') + requirePermission('user:assign-role') on /users, and
    // canAssignRole() in UserService.
    const hrPromotion = await request(ctx.app)
      .patch(`/api/v1/users/${ctx.ids.users.hr}/role`)
      .set(bearer(hr.accessToken))
      .send({ role: 'admin' });
    expect(hrPromotion.status).toBe(403);

    expect((await login(ctx.app, 'employee@example.com')).body.user).toMatchObject({ role: 'employee' });
    expect((await login(ctx.app, 'hr@example.com')).body.user).toMatchObject({ role: 'hr' });
  });

  it('2. broken object-level authorisation: changing the id in the URL reveals nothing', async () => {
    const employee = await login(ctx.app, 'employee@example.com');
    // Control: employeeAccess() in EmployeeService answers 404 for records outside your scope.
    const response = await request(ctx.app)
      .get(`/api/v1/employees/${ctx.ids.employees.salesRep}`)
      .set(bearer(employee.accessToken));
    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('Employee not found');
    expect(response.text).not.toContain('sales.rep@example.com');
  });

  it('3. refresh-token replay after rotation is detected and kills the session', async () => {
    const victim = await login(ctx.app, 'employee@example.com');
    const stolen = victim.refreshCookie; // attacker copies the token

    // The real client refreshes first: the token rotates.
    const legit = await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', stolen);
    expect(legit.status).toBe(200);
    const current = refreshCookieFrom(legit);

    // Control: AuthService.refresh() finds the token already used → reuse detected →
    // the whole token family (session) is revoked and the event audited.
    const replay = await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', stolen);
    expect(replay.status).toBe(401);

    // Neither the attacker nor the victim's current tokens work any more.
    expect((await request(ctx.app).post('/api/v1/auth/refresh').set('Cookie', current)).status).toBe(401);
    expect(
      (await request(ctx.app).get('/api/v1/employees/me').set(bearer(legit.body.accessToken as string))).status,
    ).toBe(401);
  });
});
