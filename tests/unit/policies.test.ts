import { describe, expect, it } from 'vitest';
import type { Actor } from '../../src/domain/actor.ts';
import { employeeAccess } from '../../src/domain/employee-access.ts';
import { DEFAULT_ROLE_PERMISSIONS } from '../../src/domain/permission.ts';
import { canAssignRole, type RoleName } from '../../src/domain/role.ts';

function actor(role: RoleName, employeeId: string): Actor {
  return {
    userId: `user-${employeeId}`,
    employeeId,
    role,
    permissions: new Set(DEFAULT_ROLE_PERMISSIONS[role]),
    sessionId: 'session',
    requestId: 'request',
  };
}

const report = { id: 'report', manager: { id: 'manager', firstName: 'M', lastName: 'M' } };
const stranger = { id: 'stranger', manager: { id: 'someone-else', firstName: 'S', lastName: 'E' } };

describe('employeeAccess (object-level authorisation)', () => {
  it('gives HR and admin access to everyone', () => {
    expect(employeeAccess(actor('hr', 'hr'), stranger)).toBe('all');
    expect(employeeAccess(actor('admin', 'admin'), stranger)).toBe('all');
  });

  it('gives a manager access to direct reports only', () => {
    expect(employeeAccess(actor('manager', 'manager'), report)).toBe('team');
    expect(employeeAccess(actor('manager', 'manager'), stranger)).toBe('none');
  });

  it('gives an employee access to their own record only', () => {
    expect(employeeAccess(actor('employee', 'report'), report)).toBe('self');
    expect(employeeAccess(actor('employee', 'report'), stranger)).toBe('none');
  });
});

describe('canAssignRole', () => {
  it('lets admins grant any role', () => {
    expect(canAssignRole('admin', 'admin')).toBe(true);
  });

  it('never lets HR grant admin or hr', () => {
    expect(canAssignRole('hr', 'admin')).toBe(false);
    expect(canAssignRole('hr', 'hr')).toBe(false);
    expect(canAssignRole('hr', 'manager')).toBe(true);
  });

  it('lets managers and employees grant nothing', () => {
    expect(canAssignRole('manager', 'employee')).toBe(false);
    expect(canAssignRole('employee', 'employee')).toBe(false);
  });
});
