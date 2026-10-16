import type { Request, RequestHandler } from 'express';
import type { Actor } from '../domain/actor.ts';
import { UnauthenticatedError } from '../errors/app-error.ts';
import type { AuthService } from '../services/auth.service.ts';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/**
 * `authenticate`: requires `Authorization: Bearer <access token>`. Verifies the token and
 * its session, then sets `req.actor`. Identity comes ONLY from here, never from a user id
 * or role in the URL or body.
 */
export function createAuthenticate(auth: AuthService): RequestHandler {
  return async (req, _res, next) => {
    const match = BEARER.exec(req.get('authorization') ?? '');
    if (!match?.[1]) throw new UnauthenticatedError();
    req.actor = await auth.authenticate(match[1], req.requestId);
    next();
  };
}

/** For handlers behind `authenticate`: the actor, or 401 if the route was wired without it. */
export function requireActor(req: Request): Actor {
  if (!req.actor) throw new UnauthenticatedError();
  return req.actor;
}
