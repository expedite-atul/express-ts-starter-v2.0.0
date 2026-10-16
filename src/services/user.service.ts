import type { Actor } from '../domain/actor.ts';
import { canAssignRole, type RoleName } from '../domain/role.ts';
import type { UserAccount } from '../domain/user.ts';
import { ForbiddenError, NotFoundError } from '../errors/app-error.ts';
import type { UnitOfWork } from '../repositories/unit-of-work.ts';

/** Account administration: role assignment and forced session revocation (admin only). */
export class UserService {
  private readonly uow: UnitOfWork;

  constructor(uow: UnitOfWork) {
    this.uow = uow;
  }

  /**
   * Changes an account's role. Rules, checked here and not only by the route:
   * - nobody changes their own role (no self-promotion, no locking yourself out);
   * - the actor's role decides which roles it may hand out (HR may never grant admin).
   * The user's sessions are revoked: a privilege change is a security event.
   */
  async changeRole(actor: Actor, userId: string, role: RoleName): Promise<UserAccount> {
    if (userId === actor.userId) throw new ForbiddenError('You cannot change your own role');
    if (!canAssignRole(actor.role, role)) {
      throw new ForbiddenError(`You may not assign the "${role}" role`);
    }

    return this.uow.transaction(async (tx) => {
      const user = await tx.users.findById(userId);
      if (!user) throw new NotFoundError('User');
      if (user.role !== role) {
        await tx.users.updateRole(userId, await tx.roles.getIdByName(role));
        await tx.sessions.revokeAllForUser(userId, 'role_changed', new Date());
        await tx.auditLogs.record({
          actorUserId: actor.userId,
          action: 'user.role_change',
          resourceType: 'user',
          resourceId: userId,
          requestId: actor.requestId,
          metadata: { from: user.role, to: role },
        });
      }
      const updated = await tx.users.findById(userId);
      if (!updated) throw new NotFoundError('User');
      return updated;
    });
  }

  async revokeAllSessions(actor: Actor, userId: string): Promise<void> {
    await this.uow.transaction(async (tx) => {
      if (!(await tx.users.findById(userId))) throw new NotFoundError('User');
      const count = await tx.sessions.revokeAllForUser(userId, 'admin_revoked', new Date());
      await tx.auditLogs.record({
        actorUserId: actor.userId,
        action: 'session.revoke',
        resourceType: 'user',
        resourceId: userId,
        requestId: actor.requestId,
        metadata: { reason: 'admin_revoked', sessionsRevoked: count },
      });
    });
  }
}
