import type { Actor } from './actor.ts';
import type { Employee } from './employee.ts';

/**
 * How the actor relates to one employee record:
 * - `all`  — admin/HR (permission `employee:access-all`): any employee
 * - `self` — the actor's own record
 * - `team` — a manager (permission `employee:access-team`) and one of their direct reports
 * - `none` — anything else: the service answers 404, as if the record did not exist
 *
 * This is object-level authorisation. Changing the id in the URL changes the record, not
 * the answer to this question.
 */
export type EmployeeAccess = 'all' | 'self' | 'team' | 'none';

/**
 * Which fields of a record the caller sees: `full` (self, admin, HR) or `team` (a manager
 * looking at a direct report: work information only, no personal phone number).
 */
export type EmployeeView = 'full' | 'team';

export function viewFor(access: Exclude<EmployeeAccess, 'none'>): EmployeeView {
  return access === 'team' ? 'team' : 'full';
}

export function employeeAccess(actor: Actor, employee: Pick<Employee, 'id' | 'manager'>): EmployeeAccess {
  if (actor.permissions.has('employee:access-all')) return 'all';
  if (actor.employeeId === null) return 'none';
  if (employee.id === actor.employeeId) return 'self';
  if (actor.permissions.has('employee:access-team') && employee.manager?.id === actor.employeeId) {
    return 'team';
  }
  return 'none';
}
