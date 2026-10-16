import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from '../domain/user.ts';
import { email, idParams, newPassword } from './common.ts';

/** Any non-empty password up to the max length: the policy applies to NEW passwords only. */
const existingPassword = () =>
  z.string().min(1, { error: 'is required' }).max(PASSWORD_MAX_LENGTH);

export const loginRequest = {
  body: z.strictObject({ email: email(), password: existingPassword() }),
};

export const changePasswordRequest = {
  body: z.strictObject({ currentPassword: existingPassword(), newPassword: newPassword() }),
};

export const sessionIdRequest = { params: idParams };
