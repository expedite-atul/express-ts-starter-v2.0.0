import { Router, type RequestHandler } from 'express';
import type { UserController } from '../controllers/user.controller.ts';
import { requirePermission, requireRole } from '../middlewares/authorize.ts';
import { validateRequest } from '../middlewares/validate-request.ts';
import { changeRoleRequest, userIdRequest } from '../validators/user.validators.ts';

/**
 * /api/v1/users — account administration, admin only. Both a role check and a permission
 * check guard these routes (defence in depth), and the service applies its own rules
 * (no self-role-change, which roles may be granted).
 */
export function createUserRouter(controller: UserController, authenticate: RequestHandler): Router {
  const router = Router();
  router.use(authenticate, requireRole('admin'));

  router.patch('/:id/role', requirePermission('user:assign-role'), validateRequest(changeRoleRequest), controller.changeRole);
  router.delete('/:id/sessions', requirePermission('session:revoke-any'), validateRequest(userIdRequest), controller.revokeSessions);

  return router;
}
