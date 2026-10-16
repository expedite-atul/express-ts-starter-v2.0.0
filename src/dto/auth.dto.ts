import type { Session } from '../domain/session.ts';
import type { UserAccount } from '../domain/user.ts';

/** The refresh token is NOT in the body: it travels only in the HttpOnly cookie. */
export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user?: UserAccountResponse;
}

export interface UserAccountResponse {
  id: string;
  email: string;
  role: string;
  employeeId: string | null;
}

export interface SessionResponse {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export function toTokenResponse(
  tokens: { accessToken: string; expiresIn: number },
  user?: UserAccount,
): TokenResponse {
  return {
    accessToken: tokens.accessToken,
    tokenType: 'Bearer',
    expiresIn: tokens.expiresIn,
    ...(user ? { user: toUserAccountResponse(user) } : {}),
  };
}

/** Never includes the password hash (the domain type does not even have one). */
export function toUserAccountResponse(user: UserAccount): UserAccountResponse {
  return { id: user.id, email: user.email, role: user.role, employeeId: user.employeeId };
}

export function toSessionResponse(session: Session, currentSessionId: string): SessionResponse {
  return {
    id: session.id,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    current: session.id === currentSessionId,
  };
}
