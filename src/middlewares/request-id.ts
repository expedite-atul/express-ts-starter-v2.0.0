import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/** Accept a caller's id only if it is short and harmless (no log injection). */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Gives every request an id, returns it in the `X-Request-Id` header of EVERY response
 * (errors included) and attaches it to logs and audit entries, so a user's error report
 * can be matched to the server's logs.
 */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.requestId = incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  };
}
