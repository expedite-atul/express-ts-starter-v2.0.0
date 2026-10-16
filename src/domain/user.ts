import type { RoleName } from './role.ts';

/** A login account. Deliberately has no password hash: that never leaves the auth flow. */
export interface UserAccount {
  id: string;
  email: string;
  role: RoleName;
  employeeId: string | null;
  isActive: boolean;
  createdAt: Date;
}

/** Only the authentication service ever sees this. */
export interface UserCredentials {
  id: string;
  passwordHash: string;
  isActive: boolean;
}

export interface NewUserAccount {
  email: string;
  passwordHash: string;
  role: RoleName;
  employeeId: string | null;
}

/** Password policy (NIST SP 800-63B): long beats complex. Max length bounds hashing cost. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
