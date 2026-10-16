import type { RequestHandler } from 'express';
import { toEmployeeResponse, toEmployeeSummary } from '../dto/employee.dto.ts';
import { toPageResponse } from '../dto/page.dto.ts';
import { requireActor } from '../middlewares/authenticate.ts';
import { getValidated } from '../middlewares/validate-request.ts';
import type { EmployeeService } from '../services/employee.service.ts';
import type { PrivacyService } from '../services/privacy.service.ts';
import {
  createEmployeeRequest,
  employeeIdRequest,
  listEmployeesRequest,
  updateEmployeeRequest,
  updateProfileRequest,
} from '../validators/employee.validators.ts';

export function createEmployeeController(employees: EmployeeService, privacy: PrivacyService) {
  return {
    create: async (req, res) => {
      const { body } = getValidated(req, createEmployeeRequest);
      const employee = await employees.create(requireActor(req), body);
      res.status(201).location(`/api/v1/employees/${employee.id}`).json(toEmployeeResponse(employee, 'full'));
    },

    list: async (req, res) => {
      const { query } = getValidated(req, listEmployeesRequest);
      const page = await employees.list(requireActor(req), query);
      res.json(toPageResponse(page, toEmployeeSummary));
    },

    getById: async (req, res) => {
      const { params } = getValidated(req, employeeIdRequest);
      const { employee, view } = await employees.getById(requireActor(req), params.id);
      res.json(toEmployeeResponse(employee, view));
    },

    update: async (req, res) => {
      const { params, body } = getValidated(req, updateEmployeeRequest);
      const { employee, view } = await employees.update(requireActor(req), params.id, body);
      res.json(toEmployeeResponse(employee, view));
    },

    deactivate: async (req, res) => {
      const { params } = getValidated(req, employeeIdRequest);
      await employees.deactivate(requireActor(req), params.id);
      res.status(204).end();
    },

    getOwnProfile: async (req, res) => {
      const employee = await employees.getOwnProfile(requireActor(req));
      res.json(toEmployeeResponse(employee, 'full'));
    },

    updateOwnProfile: async (req, res) => {
      const { body } = getValidated(req, updateProfileRequest);
      const employee = await employees.updateOwnProfile(requireActor(req), body);
      res.json(toEmployeeResponse(employee, 'full'));
    },

    exportOwnData: async (req, res) => {
      const data = await privacy.exportOwnData(requireActor(req));
      res.attachment('personal-data.json').json({
        ...data,
        profile: toEmployeeResponse(data.profile, 'full'),
      });
    },
  } satisfies Record<string, RequestHandler>;
}

export type EmployeeController = ReturnType<typeof createEmployeeController>;
