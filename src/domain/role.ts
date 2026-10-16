/** The four roles of the system. Stored in the `roles` table; referenced by name in code. */
export const ROLES = ['admin', 'hr', 'manager', 'employee'] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  admin: 'Full administration: employees, departments, roles, deactivation and sessions',
  hr: 'Creates and updates employee records and searches the directory',
  manager: 'Views and manages the employees who report to them',
  employee: 'Views and updates their own profile',
};

/**
 * Which roles an actor may give to an account (when creating it or changing its role).
 * HR may never grant admin (or hr) privileges; only an admin can.
 */
const ASSIGNABLE_ROLES: Record<RoleName, readonly RoleName[]> = {
  admin: ROLES,
  hr: ['employee', 'manager'],
  manager: [],
  employee: [],
};

export function canAssignRole(actorRole: RoleName, targetRole: RoleName): boolean {
  return ASSIGNABLE_ROLES[actorRole].includes(targetRole);
}
