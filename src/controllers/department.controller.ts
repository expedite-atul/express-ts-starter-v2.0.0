import type { RequestHandler } from 'express';
import { toDepartmentResponse } from '../dto/department.dto.ts';
import { toPageResponse } from '../dto/page.dto.ts';
import { requireActor } from '../middlewares/authenticate.ts';
import { getValidated } from '../middlewares/validate-request.ts';
import type { DepartmentService } from '../services/department.service.ts';
import {
  createDepartmentRequest,
  listDepartmentsRequest,
  updateDepartmentRequest,
} from '../validators/department.validators.ts';

export function createDepartmentController(departments: DepartmentService) {
  return {
    list: async (req, res) => {
      const { query } = getValidated(req, listDepartmentsRequest);
      res.json(toPageResponse(await departments.list(query), toDepartmentResponse));
    },

    create: async (req, res) => {
      const { body } = getValidated(req, createDepartmentRequest);
      const department = await departments.create(requireActor(req), body);
      res.status(201).location(`/api/v1/departments/${department.id}`).json(toDepartmentResponse(department));
    },

    update: async (req, res) => {
      const { params, body } = getValidated(req, updateDepartmentRequest);
      const department = await departments.update(requireActor(req), params.id, body);
      res.json(toDepartmentResponse(department));
    },
  } satisfies Record<string, RequestHandler>;
}

export type DepartmentController = ReturnType<typeof createDepartmentController>;
