import { randomUUID } from 'node:crypto';
import { SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { UnauthenticatedError } from '../../src/errors/app-error.ts';
import { TokenService } from '../../src/services/token.service.ts';
import { testConfig } from '../helpers/test-config.ts';

const config = testConfig();
const tokens = new TokenService(config);
const claims = { userId: randomUUID(), sessionId: randomUUID() };

/** Signs a token like the real service, with one property changed. */
function forge(options: { secret?: string; issuer?: string; audience?: string; expiresAt?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(options.issuer ?? config.JWT_ISSUER)
    .setAudience(options.audience ?? config.JWT_AUDIENCE)
    .setIssuedAt(now - 3600)
    .setExpirationTime(options.expiresAt ?? now + 600)
    .sign(new TextEncoder().encode(options.secret ?? config.JWT_ACCESS_SECRET));
}

describe('TokenService', () => {
  it('issues an access token that verifies, with a 15-minute lifetime', async () => {
    const { token, expiresIn } = await tokens.issueAccessToken(claims);
    expect(expiresIn).toBe(900);
    await expect(tokens.verifyAccessToken(token)).resolves.toEqual(claims);
  });

  it('accepts a correctly forged token (control case for the tests below)', async () => {
    await expect(tokens.verifyAccessToken(await forge())).resolves.toEqual(claims);
  });

  it.each([
    ['expired', { expiresAt: Math.floor(Date.now() / 1000) - 60 }],
    ['signed with another secret', { secret: 'another-secret-another-secret-another-secret' }],
    ['issued by someone else', { issuer: 'evil-issuer' }],
    ['meant for another audience', { audience: 'another-api' }],
  ])('rejects a token that is %s', async (_case, options) => {
    await expect(tokens.verifyAccessToken(await forge(options))).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects an unsigned ("alg": "none") token', async () => {
    const unsigned = new UnsecuredJWT({ sid: claims.sessionId })
      .setSubject(claims.userId)
      .setIssuer(config.JWT_ISSUER)
      .setAudience(config.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .encode();
    await expect(tokens.verifyAccessToken(unsigned)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects a token whose payload was edited after signing', async () => {
    const [header, , signature] = (await forge()).split('.');
    const payload = Buffer.from(JSON.stringify({ sub: randomUUID(), sid: claims.sessionId })).toString('base64url');
    await expect(tokens.verifyAccessToken(`${header}.${payload}.${signature}`)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it('generates unpredictable refresh tokens and stores only their hash', () => {
    const first = tokens.issueRefreshToken();
    const second = tokens.issueRefreshToken();
    expect(first.token).not.toBe(second.token);
    expect(first.token.length).toBeGreaterThanOrEqual(43); // 256 bits, base64url
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).not.toContain(first.token);
    expect(tokens.hashRefreshToken(first.token)).toBe(first.hash);
  });
});
