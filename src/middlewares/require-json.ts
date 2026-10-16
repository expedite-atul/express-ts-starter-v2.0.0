import type { Request, RequestHandler } from 'express';
import { UnsupportedMediaTypeError } from '../errors/app-error.ts';

/**
 * Content-type validation: a request that HAS a body must declare it as JSON.
 * Bodiless requests (GET, or POST /auth/refresh with `Content-Length: 0`) pass.
 */
export function requireJsonBody(): RequestHandler {
  return (req, _res, next) => {
    if (hasBody(req) && !req.is('application/json')) {
      next(new UnsupportedMediaTypeError());
      return;
    }
    next();
  };
}

function hasBody(req: Request): boolean {
  const length = req.headers['content-length'];
  return req.headers['transfer-encoding'] !== undefined || (length !== undefined && length !== '0');
}
