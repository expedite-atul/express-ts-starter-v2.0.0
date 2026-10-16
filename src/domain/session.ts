import type { Permission } from './permission.ts';
import type { RoleName } from './role.ts';

/**
 * A login session = one refresh-token family. Every refresh rotates the token but keeps
 * the session. Revoking the session invalidates its refresh tokens AND its access
 * tokens (the `authenticate` middleware checks the session on every request).
 */
export interface Session {
  id: string;
  userId: string;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export const REVOCATION_REASONS = [
  'rotated',
  'logout',
  'logout_all',
  'password_change',
  'reuse_detected',
  'user_revoked',
  'admin_revoked',
  'deactivated',
  'role_changed',
] as const;
export type RevocationReason = (typeof REVOCATION_REASONS)[number];

/** What `authenticate` needs to build an Actor: the session's user, if both are active. */
export interface ActiveSessionPrincipal {
  sessionId: string;
  userId: string;
  employeeId: string | null;
  role: RoleName;
  permissions: Permission[];
}
