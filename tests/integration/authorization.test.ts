import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createTestContext, login, type TestContext } from '../helpers/test-app.ts';

describe('authorisation', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  const get = (path: string, token: string) => request(ctx.app).get(path).set(bearer(token));
  const patch = (path: string, token: string, body: object) =>
    request(ctx.app).patch(path).set(bearer(token)).send(body);

  async function roleOf(userId: string): Promise<string | undefined> {
    const rows: { name: string }[] = await ctx.dataSource.query(
      'SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1',
      [userId],
    );
    return rows[0]?.name;
  }

  describe('object level: an employee cannot read another employee’s profile by changing the URL id', () => {
    it('returns their own record but 404 for everyone else', async () => {
      const { accessToken } = await login(ctx.app, 'employee@example.com');
      const { employees } = ctx.ids;

      expect((await get(`/api/v1/employees/${employees.employee}`, accessToken)).status).toBe(200);
      for (const otherId of [employees.employee2, employees.manager, employees.salesRep, employees.admin]) {
        const response = await get(`/api/v1/employees/${otherId}`, accessToken);
        expect(response.status).toBe(404);
        // Same answer as a non-existent id: nothing about the record leaks.
        expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Employee not found' });
      }
      const nonexistent = await get('/api/v1/employees/00000000-0000-4000-8000-000000000000', accessToken);
      expect(nonexistent.body.error.message).toBe('Employee not found');
    });

    it('does not let an employee list the directory', async () => {
      const { accessToken } = await login(ctx.app, 'employee@example.com');
      expect((await get('/api/v1/employees', accessToken)).status).toBe(403);
    });
  });

  describe('manager scope', () => {
    it('lets a manager see and manage direct reports only', async () => {
      const { accessToken } = await login(ctx.app, 'manager@example.com');
      const { employees } = ctx.ids;

      const list = await get('/api/v1/employees', accessToken);
      expect(list.status).toBe(200);
      expect((list.body.items as { id: string }[]).map((e) => e.id).sort()).toEqual(
        [employees.employee, employees.employee2].sort(),
      );

      const report = await get(`/api/v1/employees/${employees.employee}`, accessToken);
      expect(report.status).toBe(200);
      expect(report.body).not.toHaveProperty('phone'); // personal contact data is not in the team view

      expect((await patch(`/api/v1/employees/${employees.employee}`, accessToken, { jobTitle: 'Senior Engineer' })).status).toBe(200);
    });

    it('denies a manager access to employees outside their reporting line', async () => {
      const { accessToken } = await login(ctx.app, 'manager@example.com');
      const { employees } = ctx.ids;

      expect((await get(`/api/v1/employees/${employees.salesRep}`, accessToken)).status).toBe(404);
      expect((await patch(`/api/v1/employees/${employees.salesRep}`, accessToken, { jobTitle: 'x' })).status).toBe(404);

      // Filters cannot widen the scope either.
      const other = await get(`/api/v1/employees?departmentId=${ctx.ids.departments.Sales}`, accessToken);
      expect(other.body.items).toEqual([]);
    });

    it('limits which fields a manager may change on a report', async () => {
      const { accessToken } = await login(ctx.app, 'manager@example.com');
      const response = await patch(`/api/v1/employees/${ctx.ids.employees.employee}`, accessToken, {
        departmentId: ctx.ids.departments.Sales,
      });
      expect(response.status).toBe(403);
      expect(response.body.error.details[0].path).toBe('body.departmentId');
    });
  });

  describe('privilege escalation', () => {
    it('HR cannot grant themselves admin through the role endpoint', async () => {
      const { accessToken } = await login(ctx.app, 'hr@example.com');
      const response = await patch(`/api/v1/users/${ctx.ids.users.hr}/role`, accessToken, { role: 'admin' });
      expect(response.status).toBe(403);
      expect(await roleOf(ctx.ids.users.hr)).toBe('hr');
    });

    it('HR cannot grant admin by putting "role" in an employee update', async () => {
      const { accessToken } = await login(ctx.app, 'hr@example.com');
      const response = await patch(`/api/v1/employees/${ctx.ids.employees.hr}`, accessToken, { role: 'admin' });
      expect(response.status).toBe(400);
      expect(response.body.error.details).toContainEqual({ path: 'body.role', message: 'is not an allowed field' });
      expect(await roleOf(ctx.ids.users.hr)).toBe('hr');
    });

    it('HR cannot create an admin account', async () => {
      const { accessToken } = await login(ctx.app, 'hr@example.com');
      const response = await request(ctx.app)
        .post('/api/v1/employees')
        .set(bearer(accessToken))
        .send({
          firstName: 'Ivy',
          lastName: 'Intruder',
          workEmail: 'ivy@example.com',
          departmentId: ctx.ids.departments.Engineering,
          jobTitle: 'Engineer',
          joiningDate: '2026-01-05',
          account: { role: 'admin', password: 'Long-enough-password-1' },
        });
      expect(response.status).toBe(403);
    });

    it('admins can change roles, but never their own', async () => {
      const { accessToken } = await login(ctx.app, 'admin@example.com');
      const promote = await patch(`/api/v1/users/${ctx.ids.users.employee2}/role`, accessToken, { role: 'manager' });
      expect(promote.status).toBe(200);
      expect(promote.body).toMatchObject({ role: 'manager' });

      const self = await patch(`/api/v1/users/${ctx.ids.users.admin}/role`, accessToken, { role: 'employee' });
      expect(self.status).toBe(403);
      expect(await roleOf(ctx.ids.users.admin)).toBe('admin');
    });

    it('a role change revokes the user’s existing sessions', async () => {
      const target = await login(ctx.app, 'employee2@example.com');
      const admin = await login(ctx.app, 'admin@example.com');
      await patch(`/api/v1/users/${ctx.ids.users.employee2}/role`, admin.accessToken, { role: 'manager' });
      expect((await get('/api/v1/employees/me', target.accessToken)).status).toBe(401);
    });
  });

  describe('mass assignment on your own profile', () => {
    it.each([
      ['role', { role: 'admin' }],
      ['salary', { salary: 250000 }],
      ['departmentId', { departmentId: '00000000-0000-4000-8000-000000000000' }],
      ['employmentStatus', { employmentStatus: 'active' }],
    ])('rejects "%s" in PATCH /employees/me', async (field, body) => {
      const { accessToken } = await login(ctx.app, 'employee@example.com');
      const response = await patch('/api/v1/employees/me', accessToken, { phone: '+1-555-0199', ...body });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toContainEqual({ path: `body.${field}`, message: 'is not an allowed field' });
      // Nothing was written, not even the allowed field.
      const profile = await get('/api/v1/employees/me', accessToken);
      expect(profile.body.phone).toBe('+1-555-0103');
      expect(profile.body.department.name).toBe('Engineering');
      expect(await roleOf(ctx.ids.users.employee)).toBe('employee');
    });

    it('accepts the permitted self-service fields', async () => {
      const { accessToken } = await login(ctx.app, 'employee@example.com');
      const response = await patch('/api/v1/employees/me', accessToken, { phone: '+1-555-0199', firstName: 'Em' });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ phone: '+1-555-0199', firstName: 'Em' });
    });

    it('does not let an employee use the admin update endpoint on themselves', async () => {
      const { accessToken } = await login(ctx.app, 'employee@example.com');
      const response = await patch(`/api/v1/employees/${ctx.ids.employees.employee}`, accessToken, { jobTitle: 'CTO' });
      expect(response.status).toBe(403);
    });
  });

  describe('unauthenticated requests', () => {
    const someId = '00000000-0000-4000-8000-000000000000';
    const protectedRoutes: [string, string][] = [
      ['get', '/api/v1/employees'],
      ['post', '/api/v1/employees'],
      ['get', `/api/v1/employees/${someId}`],
      ['patch', `/api/v1/employees/${someId}`],
      ['delete', `/api/v1/employees/${someId}`],
      ['get', '/api/v1/employees/me'],
      ['patch', '/api/v1/employees/me'],
      ['get', '/api/v1/employees/me/export'],
      ['get', '/api/v1/departments'],
      ['post', '/api/v1/departments'],
      ['patch', `/api/v1/departments/${someId}`],
      ['patch', `/api/v1/users/${someId}/role`],
      ['delete', `/api/v1/users/${someId}/sessions`],
      ['post', '/api/v1/auth/logout-all'],
      ['get', '/api/v1/auth/sessions'],
      ['delete', `/api/v1/auth/sessions/${someId}`],
      ['post', '/api/v1/auth/change-password'],
    ];

    it.each(protectedRoutes)('%s %s → 401 without a token, or with a garbage token', async (method, path) => {
      const call = (headers: Record<string, string>) =>
        (request(ctx.app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path).set(headers);

      const noToken = await call({});
      expect(noToken.status).toBe(401);
      expect(noToken.body.error.code).toBe('UNAUTHENTICATED');

      const garbage = await call({ Authorization: 'Bearer not.a.jwt' });
      expect(garbage.status).toBe(401);
    });
  });
});
