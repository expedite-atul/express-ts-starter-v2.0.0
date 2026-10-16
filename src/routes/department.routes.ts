import { Router, type RequestHandler } from 'express';
import type { DepartmentController } from '../controllers/department.controller.ts';
import { requirePermission } from '../middlewares/authorize.ts';
import { validateRequest } from '../middlewares/validate-request.ts';
import {
  createDepartmentRequest,
  listDepartmentsRequest,
  updateDepartmentRequest,
} from '../validators/department.validators.ts';

/** /api/v1/departments */
export function createDepartmentRouter(controller: DepartmentController, authenticate: RequestHandler): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/', requirePermission('department:read'), validateRequest(listDepartmentsRequest), controller.list);
  router.post('/', requirePermission('department:create'), validateRequest(createDepartmentRequest), controller.create);
  router.patch('/:id', requirePermission('department:update'), validateRequest(updateDepartmentRequest), controller.update);

  return router;
}
