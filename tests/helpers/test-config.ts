import { randomBytes } from 'node:crypto';
import { parseEnv, type Env } from '../../src/config/env.ts';

/**
 * Tests never read .env (that points at your development database). They use a separate
 * database: TEST_DATABASE_URL, or the docker-compose default below.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/employee_management_test';

/** A fresh random secret per test run: nothing secret is committed, even for tests. */
const TEST_JWT_SECRET = randomBytes(32).toString('base64url');

export const TRUSTED_ORIGIN = 'http://localhost:5173';

/** Builds a valid configuration through the real parser; `overrides` change single values. */
export function testConfig(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    PORT: '0',
    LOG_LEVEL: 'info',
    TRUST_PROXY_HOPS: '0',
    DATABASE_URL: TEST_DATABASE_URL,
    DATABASE_POOL_SIZE: '5',
    JWT_ACCESS_SECRET: TEST_JWT_SECRET,
    JWT_ACCESS_TTL: '15m',
    JWT_ISSUER: 'employee-management-api',
    JWT_AUDIENCE: 'employee-management-clients',
    REFRESH_TOKEN_TTL_DAYS: '7',
    CORS_ORIGINS: TRUSTED_ORIGIN,
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_MAX_REQUESTS: '10000',
    AUTH_RATE_LIMIT_WINDOW_MS: '60000',
    AUTH_RATE_LIMIT_MAX_REQUESTS: '10000',
    AUDIT_LOG_RETENTION_DAYS: '365',
    INACTIVE_EMPLOYEE_RETENTION_DAYS: '2190',
    ...overrides,
  });
}
