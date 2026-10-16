import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { decodeJwt, jwtVerify, SignJWT } from 'jose';
import { UnauthenticatedError } from '../errors/app-error.ts';

export interface TokenConfig {
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  REFRESH_TOKEN_TTL_DAYS: number;
}

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

export interface IssuedRefreshToken {
  /** Sent to the client once, in an HttpOnly cookie. Never stored. */
  token: string;
  /** What the database stores. */
  hash: string;
  expiresAt: Date;
}

const ALGORITHM = 'HS256';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Access tokens: short-lived JWTs signed with HS256. They carry only the user id (`sub`)
 * and session id (`sid`), no personal data and no role (the role is read from the
 * database on every request, so a role change applies at once).
 *
 * Refresh tokens: 256 random bits. Opaque, not JWTs: they mean nothing without the database.
 */
export class TokenService {
  private readonly config: TokenConfig;
  private readonly key: Uint8Array;

  constructor(config: TokenConfig) {
    this.config = config;
    this.key = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
  }

  async issueAccessToken(claims: AccessTokenClaims): Promise<{ token: string; expiresIn: number }> {
    const token = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(this.config.JWT_ISSUER)
      .setAudience(this.config.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(this.config.JWT_ACCESS_TTL)
      .setJti(randomUUID())
      .sign(this.key);
    const { exp = 0, iat = 0 } = decodeJwt(token);
    return { token, expiresIn: exp - iat };
  }

  /**
   * Verifies the signature AND the claims: algorithm (only HS256, so "alg: none" or a
   * swapped algorithm is rejected), expiry, issuer and audience. Any failure gives the same
   * 401, without saying which check failed.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        requiredClaims: ['sub', 'sid', 'iat', 'exp'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new Error('bad claims');
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      throw new UnauthenticatedError('Invalid or expired access token', 'INVALID_TOKEN');
    }
  }

  issueRefreshToken(now = new Date()): IssuedRefreshToken {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      hash: this.hashRefreshToken(token),
      expiresAt: new Date(now.getTime() + this.config.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    };
  }

  /**
   * SHA-256 is enough here (no slow hash needed): the token is 256 random bits, so it
   * cannot be guessed, unlike a password.
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
