import { z } from 'zod';
import {
  EMPLOYEE_SORT_FIELDS,
  EMPLOYMENT_STATUSES,
  UPDATABLE_STATUSES,
} from '../domain/employee.ts';
import { ROLES } from '../domain/role.ts';
import {
  email,
  idParams,
  isoDate,
  newPassword,
  NON_EMPTY_ERROR,
  nonEmpty,
  pageQuery,
  personName,
  phone,
  uuid,
} from './common.ts';

/** Every field an employee record can have through the API. No role, no salary, no status "inactive". */
const employeeFields = {
  firstName: personName(),
  lastName: personName(),
  workEmail: email(),
  phone: phone().nullable(),
  departmentId: uuid(),
  managerId: uuid().nullable(),
  jobTitle: z.string().trim().min(1, { error: 'is required' }).max(100),
  joiningDate: isoDate(),
  employmentStatus: z.enum(UPDATABLE_STATUSES, { error: 'must be active or on_leave' }),
};

export const createEmployeeRequest = {
  body: z.strictObject({
    ...employeeFields,
    phone: employeeFields.phone.default(null),
    managerId: employeeFields.managerId.default(null),
    employmentStatus: employeeFields.employmentStatus.default('active'),
    account: z
      .strictObject({
        role: z.enum(ROLES, { error: `must be one of: ${ROLES.join(', ')}` }),
        password: newPassword(),
      })
      .optional(),
  }),
};

export const listEmployeesRequest = {
  query: z.strictObject({
    ...pageQuery,
    departmentId: uuid().optional(),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    // Allowlists: anything else is a 400, so these values can never inject SQL.
    sortBy: z.enum(EMPLOYEE_SORT_FIELDS, { error: `must be one of: ${EMPLOYEE_SORT_FIELDS.join(', ')}` }).default('lastName'),
    sortOrder: z.enum(['asc', 'desc'], { error: 'must be asc or desc' }).default('asc'),
  }),
};

export const employeeIdRequest = { params: idParams };

export const updateEmployeeRequest = {
  params: idParams,
  body: z.strictObject(employeeFields).partial().refine(nonEmpty, NON_EMPTY_ERROR),
};

/** Self-service: name and phone only. Department, status, role, salary... are rejected. */
export const updateProfileRequest = {
  body: z
    .strictObject({
      firstName: employeeFields.firstName,
      lastName: employeeFields.lastName,
      phone: employeeFields.phone,
    })
    .partial()
    .refine(nonEmpty, NON_EMPTY_ERROR),
};
