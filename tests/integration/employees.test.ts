import { QueryFailedError } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeEntity } from '../../src/entities/employee.entity.ts';
import { BusinessRuleError, ConflictError } from '../../src/errors/app-error.ts';
import { AuditLogRepository } from '../../src/repositories/audit-log.repository.ts';
import { UnitOfWork } from '../../src/repositories/unit-of-work.ts';
import { bearer, createTestContext, login, type TestContext } from '../helpers/test-app.ts';

describe('employees, departments and data access', () => {
  let ctx: TestContext;
  let hrToken: string;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(async () => {
    await ctx.reset();
    hrToken = (await login(ctx.app, 'hr@example.com')).accessToken;
  });
  afterAll(() => ctx.close());

  const newEmployee = (overrides: object = {}) => ({
    firstName: 'Nina',
    lastName: 'Newman',
    workEmail: 'nina.newman@example.com',
    departmentId: ctx.ids.departments.Engineering,
    managerId: ctx.ids.employees.manager,
    jobTitle: 'Software Engineer',
    joiningDate: '2026-11-02',
    ...overrides,
  });
  const create = (body: object, token = hrToken) =>
    request(ctx.app).post('/api/v1/employees').set(bearer(token)).send(body);
  const list = (query: string, token = hrToken) =>
    request(ctx.app).get(`/api/v1/employees${query}`).set(bearer(token));
  const countEmployees = async () =>
    Number((await ctx.dataSource.query<{ count: string }[]>('SELECT count(*) FROM employees'))[0]?.count);

  describe('create', () => {
    it('creates an employee with a login account', async () => {
      const response = await create(newEmployee({ account: { role: 'employee', password: 'A-long-initial-password' } }));
      expect(response.status).toBe(201);
      expect(response.headers.location).toBe(`/api/v1/employees/${response.body.id}`);
      expect(response.body).toMatchObject({ workEmail: 'nina.newman@example.com', employmentStatus: 'active' });
      expect((await login(ctx.app, 'nina.newman@example.com', 'A-long-initial-password')).accessToken).toBeTruthy();
    });

    it('rejects a duplicate work email (case-insensitively) with 409', async () => {
      const response = await create(newEmployee({ workEmail: 'EMPLOYEE@example.com' }));
      expect(response.status).toBe(409);
      expect(response.body.error.details).toEqual([
        { path: 'workEmail', message: 'An employee with this work email already exists' },
      ]);
    });

    it('relies on the DATABASE constraint, not only application code, for unique emails', async () => {
      const insert = ctx.dataSource.getRepository(EmployeeEntity).insert({
        firstName: 'Dup',
        lastName: 'Licate',
        workEmail: 'employee@example.com',
        departmentId: ctx.ids.departments.Engineering,
        jobTitle: 'X',
        joiningDate: '2026-01-01',
      });
      await expect(insert).rejects.toBeInstanceOf(QueryFailedError);
      await expect(insert).rejects.toMatchObject({ driverError: { code: '23505', constraint: 'uq_employees_work_email' } });
    });

    it('handles references to departments and managers that do not exist', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      const badDepartment = await create(newEmployee({ departmentId: missing }));
      expect(badDepartment.status).toBe(422);
      expect(badDepartment.body.error.details[0].path).toBe('body.departmentId');

      const badManager = await create(newEmployee({ managerId: missing }));
      expect(badManager.status).toBe(422);
      expect(badManager.body.error.details[0].path).toBe('body.managerId');
    });

    it('translates a foreign-key violation from the database into a 422 error', async () => {
      // Bypass the service's friendly check to prove the database rejects it too.
      const uow = new UnitOfWork(ctx.dataSource);
      const write = uow.transaction((tx) =>
        tx.employees.create({
          ...newEmployee({ departmentId: '00000000-0000-4000-8000-000000000000' }),
          phone: null,
          managerId: null,
          employmentStatus: 'active',
        }),
      );
      await expect(write).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(write).rejects.toHaveProperty('message', 'The department does not exist');
    });

    it('rolls back every step of a multi-step operation when one step fails', async () => {
      const before = await countEmployees();
      // The audit insert is the LAST step, after the employee and user inserts.
      const spy = vi.spyOn(AuditLogRepository.prototype, 'record').mockRejectedValueOnce(new Error('audit store unavailable'));

      const response = await create(newEmployee({ account: { role: 'employee', password: 'A-long-initial-password' } }));
      spy.mockRestore();

      expect(response.status).toBe(500);
      expect(await countEmployees()).toBe(before);
      const users: unknown[] = await ctx.dataSource.query(`SELECT 1 FROM users WHERE email = 'nina.newman@example.com'`);
      expect(users).toHaveLength(0);
    });

    it('validates the body and returns a structured 400', async () => {
      const response = await create({ firstName: '', workEmail: 'not-an-email', joiningDate: '2026-13-40' });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      const paths = (response.body.error.details as { path: string }[]).map((d) => d.path);
      expect(paths).toEqual(
        expect.arrayContaining(['body.firstName', 'body.workEmail', 'body.joiningDate', 'body.departmentId', 'body.jobTitle']),
      );
    });
  });

  describe('listing: pagination, filtering, sorting', () => {
    it('paginates within the configured cap', async () => {
      const page = await list('?pageSize=2&page=2&sortBy=lastName');
      expect(page.status).toBe(200);
      expect(page.body.items).toHaveLength(2);
      expect(page.body.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 7, totalPages: 4 });

      const tooBig = await list('?pageSize=1000');
      expect(tooBig.status).toBe(400);
      expect(tooBig.body.error.details[0].path).toBe('query.pageSize');
    });

    it('sorts by an allowlisted field in either direction', async () => {
      const ascending = await list('?sortBy=joiningDate&sortOrder=asc&pageSize=100');
      const dates = (ascending.body.items as { id: string }[]).map((e) => e.id);
      const descending = await list('?sortBy=joiningDate&sortOrder=desc&pageSize=100');
      expect((descending.body.items as { id: string }[]).map((e) => e.id)).toEqual([...dates].reverse());
      expect((await list('?sortBy=salary')).status).toBe(400);
    });

    it('filters by department, status and search text', async () => {
      const sales = await list(`?departmentId=${ctx.ids.departments.Sales}`);
      expect((sales.body.items as { department: { name: string } }[]).every((e) => e.department.name === 'Sales')).toBe(true);
      expect(sales.body.pagination.totalItems).toBe(2);

      expect((await list('?employmentStatus=on_leave')).body.items).toEqual([]);

      const search = await list('?search=EVANS');
      expect((search.body.items as { lastName: string }[]).map((e) => e.lastName)).toEqual(['Evans']);
    });

    it('never returns phone numbers in list results', async () => {
      const response = await list('?pageSize=100');
      expect(response.text).not.toContain('phone');
    });
  });

  describe('SQL injection', () => {
    it.each([
      `' OR '1'='1`,
      `'; DROP TABLE employees; --`,
      `%`,
      `_`,
      `\\`,
    ])('search text %j is treated as plain text', async (attack) => {
      const response = await list(`?search=${encodeURIComponent(attack)}`);
      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]); // no row contains that text
      expect(await countEmployees()).toBe(7); // and nothing was dropped
    });

    it('rejects injection through sort and filter parameters', async () => {
      for (const query of [
        `?sortBy=${encodeURIComponent('lastName; DROP TABLE employees')}`,
        `?sortOrder=${encodeURIComponent('ASC, (SELECT 1)')}`,
        `?departmentId=${encodeURIComponent("' OR 1=1 --")}`,
        `?employmentStatus=${encodeURIComponent("active' OR 'x'='x")}`,
      ]) {
        expect((await list(query)).status, query).toBe(400);
      }
    });

    it('cannot bypass the manager scope with crafted input', async () => {
      const { accessToken } = await login(ctx.app, 'manager@example.com');
      const response = await list(`?search=${encodeURIComponent("x' OR manager_id IS NULL --")}`, accessToken);
      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);
    });

    it('treats an injection attempt in the login email as invalid input', async () => {
      const response = await request(ctx.app)
        .post('/api/v1/auth/login')
        .send({ email: "' OR 1=1 --", password: 'x' });
      expect(response.status).toBe(400);
    });
  });

  describe('update and deactivate', () => {
    it('prevents a management cycle', async () => {
      const { accessToken } = await login(ctx.app, 'admin@example.com');
      // Morgan manages Emery; making Emery Morgan's manager would create a loop.
      const response = await request(ctx.app)
        .patch(`/api/v1/employees/${ctx.ids.employees.manager}`)
        .set(bearer(accessToken))
        .send({ managerId: ctx.ids.employees.employee });
      expect(response.status).toBe(422);
    });

    it('deactivates instead of deleting, and refuses while the person still manages others', async () => {
      const { accessToken } = await login(ctx.app, 'admin@example.com');
      const managerResponse = await request(ctx.app)
        .delete(`/api/v1/employees/${ctx.ids.employees.manager}`)
        .set(bearer(accessToken));
      expect(managerResponse.status).toBe(409);

      const response = await request(ctx.app)
        .delete(`/api/v1/employees/${ctx.ids.employees.employee2}`)
        .set(bearer(accessToken));
      expect(response.status).toBe(204);
      const rows: { employment_status: string }[] = await ctx.dataSource.query(
        'SELECT employment_status FROM employees WHERE id = $1',
        [ctx.ids.employees.employee2],
      );
      expect(rows[0]?.employment_status).toBe('inactive');
    });

    it('only admins can deactivate', async () => {
      const response = await request(ctx.app)
        .delete(`/api/v1/employees/${ctx.ids.employees.employee2}`)
        .set(bearer(hrToken));
      expect(response.status).toBe(403);
    });
  });

  describe('departments', () => {
    it('creates, lists and updates departments; names are unique', async () => {
      const created = await request(ctx.app).post('/api/v1/departments').set(bearer(hrToken)).send({ name: 'Legal' });
      expect(created.status).toBe(201);

      const duplicate = await request(ctx.app).post('/api/v1/departments').set(bearer(hrToken)).send({ name: 'Legal' });
      expect(duplicate.status).toBe(409);
      expect(ConflictError.name).toBe('ConflictError');

      const updated = await request(ctx.app)
        .patch(`/api/v1/departments/${created.body.id}`)
        .set(bearer(hrToken))
        .send({ description: 'Contracts and compliance' });
      expect(updated.body).toMatchObject({ name: 'Legal', description: 'Contracts and compliance' });

      const { accessToken } = await login(ctx.app, 'employee@example.com');
      const listed = await request(ctx.app).get('/api/v1/departments').set(bearer(accessToken));
      expect(listed.body.pagination.totalItems).toBe(5);
      expect((await request(ctx.app).post('/api/v1/departments').set(bearer(accessToken)).send({ name: 'X' })).status).toBe(403);
    });
  });
});
