import { Router, type RequestHandler } from 'express';
import type { EmployeeController } from '../controllers/employee.controller.ts';
import { requirePermission } from '../middlewares/authorize.ts';
import type { RateLimiters } from '../middlewares/rate-limit.ts';
import { validateRequest } from '../middlewares/validate-request.ts';
import {
  createEmployeeRequest,
  employeeIdRequest,
  listEmployeesRequest,
  updateEmployeeRequest,
  updateProfileRequest,
} from '../validators/employee.validators.ts';

/**
 * /api/v1/employees — every route requires authentication and a permission.
 * The permission answers "may you call this endpoint?"; the service then answers
 * "may you touch THIS record and THESE fields?".
 */
export function createEmployeeRouter(
  controller: EmployeeController,
  authenticate: RequestHandler,
  limiters: RateLimiters,
): Router {
  const router = Router();
  router.use(authenticate);

  // "/me" routes come before "/:id", otherwise "me" would be read as an id.
  router.get('/me', requirePermission('profile:read'), controller.getOwnProfile);
  router.patch('/me', requirePermission('profile:update'), validateRequest(updateProfileRequest), controller.updateOwnProfile);
  router.get('/me/export', limiters.bulk, requirePermission('profile:export'), controller.exportOwnData);

  router.post('/', requirePermission('employee:create'), validateRequest(createEmployeeRequest), controller.create);
  router.get('/', limiters.bulk, requirePermission('employee:list'), validateRequest(listEmployeesRequest), controller.list);
  router.get('/:id', requirePermission('employee:read'), validateRequest(employeeIdRequest), controller.getById);
  router.patch('/:id', requirePermission('employee:update'), validateRequest(updateEmployeeRequest), controller.update);
  router.delete('/:id', requirePermission('employee:deactivate'), validateRequest(employeeIdRequest), controller.deactivate);

  return router;
}
