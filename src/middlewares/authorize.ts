import type { RequestHandler } from 'express';
import type { Permission } from '../domain/permission.ts';
import type { RoleName } from '../domain/role.ts';
import { ForbiddenError } from '../errors/app-error.ts';
import { requireActor } from './authenticate.ts';

/**
 * Function-level authorisation: may this user call this endpoint at all?
 * Object-level checks (whose record is it? is it in my team?) happen in the services:
 * a permission check alone is not enough for most endpoints.
 */

/** Allows the request if the actor has ALL of the given permissions. */
export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    const actor = requireActor(req);
    if (!permissions.every((permission) => actor.permissions.has(permission))) {
      throw new ForbiddenError();
    }
    next();
  };
}

/** Allows the request if the actor has ANY of the given roles. Prefer permissions where possible. */
export function requireRole(...roles: RoleName[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(requireActor(req).role)) throw new ForbiddenError();
    next();
  };
}
