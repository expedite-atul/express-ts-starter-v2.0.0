import { z } from 'zod';
import { idParams, NON_EMPTY_ERROR, nonEmpty, pageQuery } from './common.ts';

const departmentFields = {
  name: z.string().trim().min(1, { error: 'is required' }).max(100),
  description: z.string().trim().max(500).nullable(),
};

export const listDepartmentsRequest = { query: z.strictObject(pageQuery) };

export const createDepartmentRequest = {
  body: z.strictObject({ ...departmentFields, description: departmentFields.description.default(null) }),
};

export const updateDepartmentRequest = {
  params: idParams,
  body: z.strictObject(departmentFields).partial().refine(nonEmpty, NON_EMPTY_ERROR),
};
