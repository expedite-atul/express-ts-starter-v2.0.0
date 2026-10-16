import { describe, expect, it } from 'vitest';
import { ConfigError, parseEnv } from '../../src/config/env.ts';
import { testConfig } from '../helpers/test-config.ts';

/** A complete, valid set of variables as raw strings (what process.env would hold). */
function validSource(): Record<string, string> {
  const config = testConfig();
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)]),
  );
}

function problemsFor(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof ConfigError) return [...error.problems];
    throw error;
  }
  throw new Error('expected parseEnv to fail');
}

describe('configuration (src/config/env.ts)', () => {
  it('parses a valid configuration into typed values', () => {
    const config = parseEnv({ ...validSource(), PORT: '8080', CORS_ORIGINS: 'http://a.test, https://b.test' });
    expect(config.PORT).toBe(8080);
    expect(config.CORS_ORIGINS).toEqual(['http://a.test', 'https://b.test']);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('reports a missing DATABASE_URL by name', () => {
    const { DATABASE_URL: _removed, ...rest } = validSource();
    expect(problemsFor(rest)).toEqual(['DATABASE_URL is required']);
  });

  it('reports every problem at once, without echoing any value', () => {
    const secretUrl = 'mysql://root:super-secret-password@db/x';
    const problems = problemsFor({
      ...validSource(),
      DATABASE_URL: secretUrl,
      PORT: '99999',
      JWT_ACCESS_SECRET: 'replace_with_a_secure_random_secret',
    });
    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).not.toContain('super-secret-password');
    expect(problems.join('\n')).not.toContain('replace_with_a_secure');
  });

  it('rejects weak or long-lived token settings', () => {
    expect(problemsFor({ ...validSource(), JWT_ACCESS_SECRET: 'short' })[0]).toMatch(/at least 32/);
    expect(problemsFor({ ...validSource(), JWT_ACCESS_TTL: '2h' })[0]).toMatch(/1h or less/);
  });

  it('rejects wildcard or malformed CORS origins', () => {
    expect(problemsFor({ ...validSource(), CORS_ORIGINS: '*' })[0]).toMatch(/^CORS_ORIGINS/);
    expect(problemsFor({ ...validSource(), CORS_ORIGINS: 'http://a.test/path' })[0]).toMatch(/^CORS_ORIGINS/);
  });

  it('requires https origins in production', () => {
    expect(problemsFor({ ...validSource(), NODE_ENV: 'production' })).toEqual([
      'CORS_ORIGINS must use https:// origins when NODE_ENV is production',
    ]);
  });
});
