import type { RoleName } from './role.ts';

/**
 * Every permission in the system, as `resource:action`.
 *
 * Routes check these with `requirePermission(...)` (function-level authorisation).
 * Which records a permission applies to is decided separately, by the service
 * (object-level authorisation): see `employee:access-all` / `employee:access-team`.
 */
export const PERMISSIONS = {
  'employee:create': 'Create employee records (and their login accounts)',
  'employee:list': 'List and search employees',
  'employee:read': 'Read a single employee record',
  'employee:update': 'Update employee records',
  'employee:deactivate': 'Deactivate employees and disable their accounts',
  'employee:access-all': 'Scope: the employee permissions above apply to every employee',
  'employee:access-team': 'Scope: the employee permissions above apply to direct reports',
  'profile:read': 'Read your own profile',
  'profile:update': 'Update the self-service fields of your own profile',
  'profile:export': 'Export your own personal data',
  'department:read': 'List departments',
  'department:create': 'Create departments',
  'department:update': 'Update departments',
  'user:assign-role': "Change an account's role",
  'session:revoke-any': "Revoke any user's sessions",
} as const;

export type Permission = keyof typeof PERMISSIONS;

const SELF_SERVICE: Permission[] = [
  'profile:read',
  'profile:update',
  'profile:export',
  'department:read',
  'employee:read',
];

/**
 * The default role → permission matrix. `npm run db:seed` writes it to the
 * `role_permissions` table; at runtime the database is the source of truth.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  admin: Object.keys(PERMISSIONS) as Permission[],
  hr: [
    ...SELF_SERVICE,
    'employee:create',
    'employee:list',
    'employee:update',
    'employee:access-all',
    'department:create',
    'department:update',
  ],
  manager: [...SELF_SERVICE, 'employee:list', 'employee:update', 'employee:access-team'],
  employee: SELF_SERVICE,
};

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}
