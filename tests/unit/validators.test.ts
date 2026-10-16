import { describe, expect, it } from 'vitest';
import { loginRequest } from '../../src/validators/auth.validators.ts';
import {
  listEmployeesRequest,
  updateProfileRequest,
} from '../../src/validators/employee.validators.ts';

describe('request validators', () => {
  it('applies list defaults', () => {
    expect(listEmployeesRequest.query.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      sortBy: 'lastName',
      sortOrder: 'asc',
    });
  });

  it('caps the page size at 100', () => {
    expect(listEmployeesRequest.query.safeParse({ pageSize: '100' }).success).toBe(true);
    expect(listEmployeesRequest.query.safeParse({ pageSize: '101' }).success).toBe(false);
  });

  it('accepts only allowlisted sort fields and directions', () => {
    expect(listEmployeesRequest.query.safeParse({ sortBy: 'joiningDate', sortOrder: 'desc' }).success).toBe(true);
    expect(listEmployeesRequest.query.safeParse({ sortBy: 'password_hash' }).success).toBe(false);
    expect(listEmployeesRequest.query.safeParse({ sortBy: 'last_name; DROP TABLE employees' }).success).toBe(false);
    expect(listEmployeesRequest.query.safeParse({ sortOrder: 'asc, 1' }).success).toBe(false);
  });

  it('rejects unknown query parameters', () => {
    expect(listEmployeesRequest.query.safeParse({ role: 'admin' }).success).toBe(false);
  });

  it('normalises login emails', () => {
    expect(loginRequest.body.parse({ email: '  Ann@Example.COM ', password: 'x' }).email).toBe('ann@example.com');
  });

  it('rejects fields an employee may not set on their own profile', () => {
    for (const field of ['role', 'salary', 'departmentId', 'employmentStatus', 'workEmail']) {
      expect(updateProfileRequest.body.safeParse({ [field]: 'x' }).success, field).toBe(false);
    }
    expect(updateProfileRequest.body.safeParse({ phone: '+1-555-0199' }).success).toBe(true);
  });
});
