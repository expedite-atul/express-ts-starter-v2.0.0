import type { RequestHandler } from 'express';
import { NotFoundError } from '../errors/app-error.ts';

/** Registered after every route: anything that reaches it matched no route. */
export function notFound(): RequestHandler {
  return (_req, _res, next) => {
    next(new NotFoundError('Route'));
  };
}
