import type { RequestHandler } from 'express';
import { rateLimit, type Options } from 'express-rate-limit';
import { TooManyRequestsError } from '../errors/app-error.ts';

export interface RateLimitConfig {
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  AUTH_RATE_LIMIT_WINDOW_MS: number;
  AUTH_RATE_LIMIT_MAX_REQUESTS: number;
}

export interface RateLimiters {
  /** Every API request, per client IP. */
  general: RequestHandler;
  /** Failed logins only: successful logins do not use up the allowance. */
  login: RequestHandler;
  refresh: RequestHandler;
  passwordChange: RequestHandler;
  /** Endpoints that return many records or a full personal-data export. */
  bulk: RequestHandler;
}

/**
 * In-memory counters, per process. Fine for one instance; with several instances use a
 * shared store (e.g. Redis) so the limit applies across all of them.
 */
export function createRateLimiters(config: RateLimitConfig): RateLimiters {
  const shared: Partial<Options> = {
    standardHeaders: 'draft-8', // RateLimit / RateLimit-Policy headers tell clients their budget
    legacyHeaders: false,
    // Let the central error handler answer, so a 429 has the same JSON shape and request id.
    handler: (_req, _res, next) => next(new TooManyRequestsError()),
  };
  const strict = {
    ...shared,
    windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS,
    limit: config.AUTH_RATE_LIMIT_MAX_REQUESTS,
  };

  return {
    general: rateLimit({
      ...shared,
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      limit: config.RATE_LIMIT_MAX_REQUESTS,
    }),
    login: rateLimit({ ...strict, skipSuccessfulRequests: true }),
    refresh: rateLimit(strict),
    passwordChange: rateLimit(strict),
    bulk: rateLimit({ ...strict, limit: config.AUTH_RATE_LIMIT_MAX_REQUESTS * 3 }),
  };
}
