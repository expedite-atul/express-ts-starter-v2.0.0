/**
 * Application configuration: the ONLY module that reads `process.env`.
 *
 * Every variable is validated once, at startup. If anything is missing or malformed
 * the app refuses to start and prints which variables are wrong (never their values,
 * because some of them are secrets).
 *
 * Who imports `env`: only entry points — src/server.ts, the TypeORM CLI data source,
 * seeds and scripts. Everything else (services, middlewares, ...) receives the values
 * it needs as constructor or function arguments, so tests can pass their own.
 * ESLint blocks `process.env` outside this file (see eslint.config.js).
 */
import dotenv from 'dotenv';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Reusable rules
// ---------------------------------------------------------------------------

/** A non-blank string. Missing, empty and whitespace-only values all fail with "is required". */
const requiredString = () =>
  z.string({ error: 'is required' }).trim().min(1, { error: 'is required' });

/** A whole number in [min, max], read from a string such as "3000". */
const integer = (min: number, max: number) =>
  requiredString()
    .transform(Number) // "3000" → 3000, "abc" → NaN (rejected below)
    .pipe(
      z
        .number({ error: 'must be a whole number' })
        .int({ error: 'must be a whole number' })
        .min(min, { error: `must be at least ${min}` })
        .max(max, { error: `must be at most ${max}` }),
    );

/** A secret from a password generator, not a word someone typed. */
const MIN_SECRET_LENGTH = 32;
const secret = () =>
  requiredString()
    .min(MIN_SECRET_LENGTH, {
      error: `must be at least ${MIN_SECRET_LENGTH} characters. Generate one with: npm run secret`,
    })
    .refine((value) => !value.startsWith('replace_with'), {
      error: 'is still the placeholder from .env.example. Generate one with: npm run secret',
    });

/**
 * A duration such as "900s", "15m" or "1h", capped at one hour: access tokens are
 * meant to be short-lived, so a typo like "15d" must not slip through.
 */
const MAX_ACCESS_TTL_SECONDS = 60 * 60;
const SECONDS_PER_UNIT = { s: 1, m: 60, h: 3600 } as const;
const shortDuration = () =>
  requiredString()
    // abort: skip the next rule when the format is already wrong (one message, not two).
    .regex(/^[1-9]\d*[smh]$/, { error: 'must look like 900s, 15m or 1h', abort: true })
    .refine((value) => durationToSeconds(value) <= MAX_ACCESS_TTL_SECONDS, {
      error: 'must be 1h or less (access tokens are short-lived)',
    });

/** "http://localhost:5173,https://app.example.com" becomes an array of exact origins. */
const originList = () =>
  requiredString()
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .refine((origins) => origins.every(isOrigin), {
      error:
        'must be a comma-separated list of origins such as https://app.example.com ' +
        '(scheme and host, optional port, no path, no trailing slash, no "*")',
    });

// ---------------------------------------------------------------------------
// The schema: one line per variable. Add new variables here AND in .env.example.
// ---------------------------------------------------------------------------

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z
  .object({
    NODE_ENV: requiredString().pipe(
      z.enum(['development', 'test', 'production'], {
        error: 'must be one of: development, test, production',
      }),
    ),
    PORT: integer(0, 65_535), // 0 = any free port (used by tests)
    LOG_LEVEL: requiredString().pipe(
      z.enum(LOG_LEVELS, { error: `must be one of: ${LOG_LEVELS.join(', ')}` }),
    ),
    // How many reverse proxies sit in front of the app (0 = none). Needed so rate limiting
    // sees the real client IP instead of the proxy's, without trusting spoofed headers.
    TRUST_PROXY_HOPS: integer(0, 10),

    DATABASE_URL: requiredString().pipe(
      z.url({
        protocol: /^postgres(ql)?$/,
        error: 'must be a postgresql:// connection URL',
      }),
    ),
    DATABASE_POOL_SIZE: integer(1, 100),

    JWT_ACCESS_SECRET: secret(),
    JWT_ACCESS_TTL: shortDuration(),
    JWT_ISSUER: requiredString(),
    JWT_AUDIENCE: requiredString(),
    REFRESH_TOKEN_TTL_DAYS: integer(1, 90),

    CORS_ORIGINS: originList(),
    RATE_LIMIT_WINDOW_MS: integer(1_000, 86_400_000),
    RATE_LIMIT_MAX_REQUESTS: integer(1, 100_000),
    AUTH_RATE_LIMIT_WINDOW_MS: integer(1_000, 86_400_000),
    AUTH_RATE_LIMIT_MAX_REQUESTS: integer(1, 10_000),

    AUDIT_LOG_RETENTION_DAYS: integer(1, 3_650),
    INACTIVE_EMPLOYEE_RETENTION_DAYS: integer(1, 3_650),
  })
  // Rules that involve more than one variable run after every variable is valid.
  .refine(
    (config) =>
      config.NODE_ENV !== 'production' ||
      config.CORS_ORIGINS.every((origin) => origin.startsWith('https://')),
    { path: ['CORS_ORIGINS'], error: 'must use https:// origins when NODE_ENV is production' },
  );

/** The validated, typed configuration. `PORT` is a number, `CORS_ORIGINS` a string[], and so on. */
export type Env = Readonly<z.infer<typeof envSchema>>;

/** Thrown by `parseEnv` when the configuration is unusable. Lists variable names only. */
export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

/**
 * Validates a set of variables and returns the typed config, or throws `ConfigError`.
 * Pure: it reads only its argument, so tests can pass any object they like.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`),
    );
  }
  return Object.freeze(result.data);
}

/**
 * Loads `.env` (local development only), validates `process.env`, and stops the
 * process if the configuration is invalid. Fail fast: a server that starts with a
 * missing secret fails later, on a real request, in a much more confusing way.
 */
function loadEnv(): Env {
  // Variables already set in the real environment win over the file, so a deployed
  // app (configured by its platform or secrets manager, with no .env file) is unaffected.
  dotenv.config({ quiet: true });

  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(
        `\n${error.message}\n\n` +
          'Fix the variables above in your .env file (copy .env.example if you have none), ' +
          'then start the app again.\n',
      );
      process.exit(1);
    }
    throw error;
  }
}

export const env: Env = loadEnv();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function durationToSeconds(value: string): number {
  const unit = value.slice(-1) as keyof typeof SECONDS_PER_UNIT;
  return Number(value.slice(0, -1)) * SECONDS_PER_UNIT[unit];
}

/** True for an exact browser origin such as "https://app.example.com:8443". */
function isOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
}
