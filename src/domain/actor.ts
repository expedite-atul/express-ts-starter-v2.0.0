import type { Permission } from './permission.ts';
import type { RoleName } from './role.ts';

/**
 * Who is making the request, established by the `authenticate` middleware from a
 * verified access token and an active session. Never built from request input.
 * Services receive it as their first argument and use it for every access decision.
 */
export interface Actor {
  userId: string;
  /** The employee record this account belongs to (null for an account without one). */
  employeeId: string | null;
  role: RoleName;
  permissions: ReadonlySet<Permission>;
  sessionId: string;
  /** Correlates audit entries and logs with the HTTP request. */
  requestId: string;
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}
