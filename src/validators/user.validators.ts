import { z } from 'zod';
import { ROLES } from '../domain/role.ts';
import { idParams } from './common.ts';

export const changeRoleRequest = {
  params: idParams,
  body: z.strictObject({ role: z.enum(ROLES, { error: `must be one of: ${ROLES.join(', ')}` }) }),
};

export const userIdRequest = { params: idParams };
