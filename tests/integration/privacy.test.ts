import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createTestContext, login, type TestContext } from '../helpers/test-app.ts';

describe('data protection', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  const auditActions = async (): Promise<string[]> =>
    (await ctx.dataSource.query<{ action: string }[]>('SELECT action FROM audit_logs ORDER BY timestamp')).map(
      (row) => row.action,
    );

  describe('personal data export', () => {
    it('exports the caller’s own data as a JSON attachment, and audits it', async () => {
      const { accessToken } = await login(ctx.app, 'employee@example.com');
      const response = await request(ctx.app).get('/api/v1/employees/me/export').set(bearer(accessToken));

      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toMatch(/^attachment; filename="?personal-data\.json"?$/);
      expect(response.body).toMatchObject({
        formatVersion: 1,
        profile: { workEmail: 'employee@example.com', phone: '+1-555-0103' },
        account: { email: 'employee@example.com', role: 'employee' },
      });
      expect(response.body.activeSessions).toHaveLength(1);
      expect(response.text).not.toMatch(/argon2|password/i);
      expect(await auditActions()).toContain('profile.export');
    });
  });

  describe('auditing', () => {
    it('records sensitive actions with field names but never personal values', async () => {
      const admin = await login(ctx.app, 'admin@example.com');
      await request(ctx.app)
        .patch(`/api/v1/employees/${ctx.ids.employees.employee}`)
        .set(bearer(admin.accessToken))
        .send({ phone: '+1-555-0177', jobTitle: 'Staff Engineer' });
      await request(ctx.app)
        .patch(`/api/v1/users/${ctx.ids.users.employee}/role`)
        .set(bearer(admin.accessToken))
        .send({ role: 'manager' });
      await request(ctx.app).delete(`/api/v1/employees/${ctx.ids.employees.employee2}`).set(bearer(admin.accessToken));

      const rows: { action: string; actor_user_id: string; request_id: string; metadata: object }[] =
        await ctx.dataSource.query('SELECT action, actor_user_id, request_id, metadata FROM audit_logs ORDER BY timestamp');
      expect(rows.map((row) => row.action)).toEqual(['employee.update', 'user.role_change', 'employee.deactivate']);
      expect(rows.every((row) => row.actor_user_id === ctx.ids.users.admin && row.request_id)).toBe(true);
      expect(rows[0]?.metadata).toEqual({ fields: ['phone', 'jobTitle'] });
      expect(rows[1]?.metadata).toEqual({ from: 'employee', to: 'manager' });
      expect(JSON.stringify(rows)).not.toContain('555-0177');
    });
  });

  describe('retention', () => {
    it('anonymises employees past the retention period and deletes old audit entries', async () => {
      const admin = await login(ctx.app, 'admin@example.com');
      await request(ctx.app).delete(`/api/v1/employees/${ctx.ids.employees.employee2}`).set(bearer(admin.accessToken));

      // Pretend the deactivation happened seven years ago, and add an ancient audit entry.
      await ctx.dataSource.query(
        `UPDATE employees SET deactivated_at = now() - interval '7 years' WHERE id = $1`,
        [ctx.ids.employees.employee2],
      );
      await ctx.dataSource.query(
        `INSERT INTO audit_logs (action, resource_type, timestamp) VALUES ('employee.update', 'employee', now() - interval '2 years')`,
      );

      const result = await ctx.services.privacy.runRetention();
      expect(result).toEqual({ employeesAnonymised: 1, auditLogsDeleted: 1 });

      const [employee] = await ctx.dataSource.query<Record<string, unknown>[]>(
        'SELECT first_name, last_name, work_email, phone, anonymised_at FROM employees WHERE id = $1',
        [ctx.ids.employees.employee2],
      );
      expect(employee).toMatchObject({ first_name: 'Former', last_name: 'Employee', phone: null });
      expect(employee?.work_email).toMatch(/^erased-.*@invalid\.invalid$/);
      expect(employee?.anonymised_at).not.toBeNull();

      const account: unknown[] = await ctx.dataSource.query('SELECT 1 FROM users WHERE employee_id = $1', [
        ctx.ids.employees.employee2,
      ]);
      expect(account).toHaveLength(0);
      expect(await auditActions()).toContain('employee.anonymise');

      // Running it again changes nothing.
      expect(await ctx.services.privacy.runRetention()).toEqual({ employeesAnonymised: 0, auditLogsDeleted: 0 });
    });
  });
});
