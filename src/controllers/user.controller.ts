import type { RequestHandler } from 'express';
import { toUserAccountResponse } from '../dto/auth.dto.ts';
import { requireActor } from '../middlewares/authenticate.ts';
import { getValidated } from '../middlewares/validate-request.ts';
import type { UserService } from '../services/user.service.ts';
import { changeRoleRequest, userIdRequest } from '../validators/user.validators.ts';

export function createUserController(users: UserService) {
  return {
    changeRole: async (req, res) => {
      const { params, body } = getValidated(req, changeRoleRequest);
      const user = await users.changeRole(requireActor(req), params.id, body.role);
      res.json(toUserAccountResponse(user));
    },

    revokeSessions: async (req, res) => {
      const { params } = getValidated(req, userIdRequest);
      await users.revokeAllSessions(requireActor(req), params.id);
      res.status(204).end();
    },
  } satisfies Record<string, RequestHandler>;
}

export type UserController = ReturnType<typeof createUserController>;
