import cors from 'cors';
import type { RequestHandler } from 'express';
import { ForbiddenError } from '../errors/app-error.ts';

/**
 * CORS with an explicit allowlist (never "*", and never reflecting any origin).
 *
 * A browser request from an origin that is not on the list is rejected with 403, not just
 * left without CORS headers, so a malicious site cannot even trigger a state-changing
 * request. Requests with no Origin header (curl, Postman, server-to-server) are not
 * cross-origin browser requests, so CORS does not apply to them.
 */
export function createCors(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return cors({
    origin(origin, callback) {
      if (origin === undefined || allowed.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new ForbiddenError('This origin is not allowed to call the API'));
    },
    credentials: true, // the refresh-token cookie
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
  });
}
