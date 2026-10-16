import type { Actor } from '../domain/actor.ts';
import type { Session } from '../domain/session.ts';
import type { UserAccount } from '../domain/user.ts';
import {
  InvalidCredentialsError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '../errors/app-error.ts';
import type { UnitOfWork } from '../repositories/unit-of-work.ts';
import type { PasswordHasher } from './password-hasher.ts';
import type { IssuedRefreshToken, TokenService } from './token.service.ts';

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
  refreshToken: IssuedRefreshToken;
}

const MAX_USER_AGENT_LENGTH = 255;

/**
 * Authentication and session management (Module B).
 *
 * A session is a refresh-token family. Login starts one; each refresh rotates the token
 * inside it; logout and revocation end it. Because `authenticate` checks the session on
 * every request, ending a session also stops its access tokens immediately.
 */
export class AuthService {
  private readonly uow: UnitOfWork;
  private readonly passwords: PasswordHasher;
  private readonly tokens: TokenService;

  constructor(uow: UnitOfWork, passwords: PasswordHasher, tokens: TokenService) {
    this.uow = uow;
    this.passwords = passwords;
    this.tokens = tokens;
  }

  async login(
    email: string,
    password: string,
    userAgent: string | undefined,
  ): Promise<TokenPair & { user: UserAccount }> {
    const credentials = await this.uow.repositories.users.findCredentialsByEmail(email);

    // Same error, and roughly the same time, whether the account is missing, disabled or
    // the password is wrong: the response must not reveal which accounts exist.
    if (!credentials) {
      await this.passwords.verifyAgainstDummy(password);
      throw new InvalidCredentialsError();
    }
    const passwordMatches = await this.passwords.verify(credentials.passwordHash, password);
    if (!passwordMatches || !credentials.isActive) throw new InvalidCredentialsError();

    const refreshToken = this.tokens.issueRefreshToken();
    const sessionId = await this.uow.transaction(async (tx) => {
      const id = await tx.sessions.create({
        userId: credentials.id,
        userAgent: userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
        expiresAt: refreshToken.expiresAt,
      });
      await tx.refreshTokens.create({
        userId: credentials.id,
        familyId: id,
        tokenHash: refreshToken.hash,
        expiresAt: refreshToken.expiresAt,
      });
      return id;
    });

    const access = await this.tokens.issueAccessToken({ userId: credentials.id, sessionId });
    const user = await this.uow.repositories.users.findById(credentials.id);
    if (!user) throw new InvalidCredentialsError();
    return { accessToken: access.token, expiresIn: access.expiresIn, refreshToken, user };
  }

  /**
   * Refresh-token rotation with reuse detection.
   *
   * 1. Find the token by its hash and lock the row (concurrent refreshes queue up).
   * 2. Already used or revoked? Someone is replaying it, so it may be stolen: revoke the
   *    whole session (family), for the attacker AND the real user, and audit it.
   * 3. Otherwise mark it used, issue a new one in the same family, and a new access token.
   */
  async refresh(presentedToken: string | undefined, requestId: string): Promise<TokenPair> {
    if (!presentedToken) throw invalidRefreshToken();
    const now = new Date();
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);

    const outcome = await this.uow.transaction(async (tx) => {
      const stored = await tx.refreshTokens.findByHashForUpdate(tokenHash);
      if (!stored) return { kind: 'invalid' } as const;

      if (stored.revokedAt !== null) {
        const wasActive = await tx.sessions.revoke(stored.familyId, 'reuse_detected', now);
        if (wasActive) {
          await tx.auditLogs.record({
            actorUserId: stored.userId,
            action: 'session.reuse_detected',
            resourceType: 'session',
            resourceId: stored.familyId,
            requestId,
          });
        }
        // Return (not throw) so the transaction COMMITS the revocation; throwing here
        // would roll it back. The error is thrown below, after the commit.
        return { kind: 'reused' } as const;
      }

      const principal = await tx.sessions.findActivePrincipal(stored.familyId, now);
      if (stored.expiresAt <= now || !principal) return { kind: 'invalid' } as const;

      const next = this.tokens.issueRefreshToken(now);
      await tx.refreshTokens.revoke(stored.id, 'rotated', now);
      await tx.refreshTokens.create({
        userId: stored.userId,
        familyId: stored.familyId,
        tokenHash: next.hash,
        expiresAt: next.expiresAt,
      });
      await tx.sessions.touch(stored.familyId, now, next.expiresAt);
      return { kind: 'rotated', userId: stored.userId, sessionId: stored.familyId, next } as const;
    });

    if (outcome.kind !== 'rotated') throw invalidRefreshToken();
    const access = await this.tokens.issueAccessToken({
      userId: outcome.userId,
      sessionId: outcome.sessionId,
    });
    return { accessToken: access.token, expiresIn: access.expiresIn, refreshToken: outcome.next };
  }

  /** Ends the session the refresh token belongs to. Idempotent: an unknown token is not an error. */
  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return;
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);
    await this.uow.transaction(async (tx) => {
      const stored = await tx.refreshTokens.findByHashForUpdate(tokenHash);
      if (stored) await tx.sessions.revoke(stored.familyId, 'logout', new Date());
    });
  }

  async logoutAll(actor: Actor): Promise<void> {
    await this.uow.transaction(async (tx) => {
      const count = await tx.sessions.revokeAllForUser(actor.userId, 'logout_all', new Date());
      await tx.auditLogs.record({
        actorUserId: actor.userId,
        action: 'auth.logout_all',
        resourceType: 'user',
        resourceId: actor.userId,
        requestId: actor.requestId,
        metadata: { sessionsRevoked: count },
      });
    });
  }

  async listSessions(actor: Actor): Promise<Session[]> {
    return this.uow.repositories.sessions.listActiveForUser(actor.userId, new Date());
  }

  /** Users can revoke only their own sessions; any other id is "not found". */
  async revokeSession(actor: Actor, sessionId: string): Promise<void> {
    await this.uow.transaction(async (tx) => {
      const now = new Date();
      const session = await tx.sessions.findActiveForUser(sessionId, actor.userId, now);
      if (!session) throw new NotFoundError('Session');
      await tx.sessions.revoke(sessionId, 'user_revoked', now);
      await tx.auditLogs.record({
        actorUserId: actor.userId,
        action: 'session.revoke',
        resourceType: 'session',
        resourceId: sessionId,
        requestId: actor.requestId,
        metadata: { reason: 'user_revoked' },
      });
    });
  }

  /**
   * Changing the password ends EVERY session, including the current one: if the password
   * was stolen, so may be the sessions. The client must log in again.
   */
  async changePassword(actor: Actor, currentPassword: string, newPassword: string): Promise<void> {
    const credentials = await this.uow.repositories.users.findCredentialsById(actor.userId);
    if (!credentials || !(await this.passwords.verify(credentials.passwordHash, currentPassword))) {
      throw new ValidationError('The request is invalid', [
        { path: 'body.currentPassword', message: 'is incorrect' },
      ]);
    }
    if (currentPassword === newPassword) {
      throw new ValidationError('The request is invalid', [
        { path: 'body.newPassword', message: 'must be different from the current password' },
      ]);
    }

    const newHash = await this.passwords.hash(newPassword);
    await this.uow.transaction(async (tx) => {
      const now = new Date();
      await tx.users.updatePassword(actor.userId, newHash, now);
      await tx.sessions.revokeAllForUser(actor.userId, 'password_change', now);
      await tx.auditLogs.record({
        actorUserId: actor.userId,
        action: 'auth.password_change',
        resourceType: 'user',
        resourceId: actor.userId,
        requestId: actor.requestId,
      });
    });
  }

  /**
   * Used by the `authenticate` middleware on every request: a valid JWT is not enough,
   * its session must still be active and its account enabled.
   */
  async authenticate(accessToken: string, requestId: string): Promise<Actor> {
    const claims = await this.tokens.verifyAccessToken(accessToken);
    const principal = await this.uow.repositories.sessions.findActivePrincipal(
      claims.sessionId,
      new Date(),
    );
    if (!principal || principal.userId !== claims.userId) {
      throw new UnauthenticatedError('Invalid or expired access token', 'INVALID_TOKEN');
    }
    return {
      userId: principal.userId,
      employeeId: principal.employeeId,
      role: principal.role,
      permissions: new Set(principal.permissions),
      sessionId: principal.sessionId,
      requestId,
    };
  }
}

function invalidRefreshToken(): UnauthenticatedError {
  return new UnauthenticatedError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
}
