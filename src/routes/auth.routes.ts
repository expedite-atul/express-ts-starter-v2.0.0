import { Router, type RequestHandler } from 'express';
import type { AuthController } from '../controllers/auth.controller.ts';
import type { RateLimiters } from '../middlewares/rate-limit.ts';
import { validateRequest } from '../middlewares/validate-request.ts';
import { changePasswordRequest, loginRequest, sessionIdRequest } from '../validators/auth.validators.ts';

/** /api/v1/auth — each line reads: path, rate limit, authentication, validation, handler. */
export function createAuthRouter(
  controller: AuthController,
  authenticate: RequestHandler,
  limiters: RateLimiters,
): Router {
  const router = Router();

  router.post('/login', limiters.login, validateRequest(loginRequest), controller.login);
  router.post('/refresh', limiters.refresh, controller.refresh);
  router.post('/logout', controller.logout);
  router.post('/logout-all', authenticate, controller.logoutAll);
  router.get('/sessions', authenticate, controller.listSessions);
  router.delete('/sessions/:id', authenticate, validateRequest(sessionIdRequest), controller.revokeSession);
  router.post(
    '/change-password',
    limiters.passwordChange,
    authenticate,
    validateRequest(changePasswordRequest),
    controller.changePassword,
  );

  return router;
}
