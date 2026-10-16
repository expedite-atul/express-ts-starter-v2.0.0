import type { Actor } from '../domain/actor.ts';

/** Properties this application adds to Express's Request object. */
declare global {
  namespace Express {
    interface Request {
      /** Set by the request-id middleware; echoed in the X-Request-Id response header. */
      requestId: string;
      /** Set by `authenticate` from a verified token and an active session. Never from input. */
      actor?: Actor;
      /** Set by `validateRequest`: parsed, typed input. Read it with `getValidated()`. */
      validated?: { params?: unknown; query?: unknown; body?: unknown };
    }
  }
}

export {};
