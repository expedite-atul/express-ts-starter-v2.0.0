import { IsNull, MoreThan, type EntityManager, type Repository } from 'typeorm';
import { isPermission } from '../domain/permission.ts';
import type { RoleName } from '../domain/role.ts';
import type { ActiveSessionPrincipal, RevocationReason, Session } from '../domain/session.ts';
import { RefreshTokenEntity } from '../entities/refresh-token.entity.ts';
import { SessionEntity } from '../entities/session.entity.ts';

export class SessionRepository {
  private readonly manager: EntityManager;
  private readonly repo: Repository<SessionEntity>;

  constructor(manager: EntityManager) {
    this.manager = manager;
    this.repo = manager.getRepository(SessionEntity);
  }

  async create(input: { userId: string; userAgent: string | null; expiresAt: Date }): Promise<string> {
    const now = new Date();
    const entity = await this.repo.save(
      this.repo.create({ ...input, lastUsedAt: now, revokedAt: null, revokedReason: null }),
    );
    return entity.id;
  }

  /**
   * Called on EVERY authenticated request: returns the session's user, role and
   * permissions, or null if the session is revoked/expired or the account is disabled.
   * This is what makes logout, deactivation and password changes take effect immediately.
   */
  async findActivePrincipal(sessionId: string, now: Date): Promise<ActiveSessionPrincipal | null> {
    const rows: {
      session_id: string;
      user_id: string;
      employee_id: string | null;
      role: RoleName;
      permissions: string[];
    }[] = await this.manager.query(
      `SELECT s.id AS session_id, u.id AS user_id, u.employee_id, r.name AS role,
              COALESCE(array_agg(p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS permissions
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 AND u.is_active = true
       GROUP BY s.id, u.id, r.name`,
      [sessionId, now],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      employeeId: row.employee_id,
      role: row.role,
      permissions: row.permissions.filter(isPermission),
    };
  }

  async listActiveForUser(userId: string, now: Date): Promise<Session[]> {
    const entities = await this.repo.find({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(now) },
      order: { lastUsedAt: 'DESC' },
    });
    return entities.map(toSession);
  }

  async findActiveForUser(sessionId: string, userId: string, now: Date): Promise<Session | null> {
    const entity = await this.repo.findOneBy({
      id: sessionId,
      userId,
      revokedAt: IsNull(),
      expiresAt: MoreThan(now),
    });
    return entity ? toSession(entity) : null;
  }

  async isActive(sessionId: string, now: Date): Promise<boolean> {
    return this.repo.existsBy({ id: sessionId, revokedAt: IsNull(), expiresAt: MoreThan(now) });
  }

  async touch(sessionId: string, lastUsedAt: Date, expiresAt: Date): Promise<void> {
    await this.repo.update({ id: sessionId }, { lastUsedAt, expiresAt });
  }

  /** Revokes one session and all of its refresh tokens. Returns false if it was not active. */
  async revoke(sessionId: string, reason: RevocationReason, at: Date): Promise<boolean> {
    const result = await this.repo.update(
      { id: sessionId, revokedAt: IsNull() },
      { revokedAt: at, revokedReason: reason },
    );
    await this.revokeTokens({ familyId: sessionId }, reason, at);
    return (result.affected ?? 0) > 0;
  }

  /** Revokes every session (and refresh token) of a user. Returns how many sessions were active. */
  async revokeAllForUser(userId: string, reason: RevocationReason, at: Date): Promise<number> {
    const result = await this.repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: at, revokedReason: reason },
    );
    await this.revokeTokens({ userId }, reason, at);
    return result.affected ?? 0;
  }

  private async revokeTokens(
    where: { familyId: string } | { userId: string },
    reason: RevocationReason,
    at: Date,
  ): Promise<void> {
    await this.manager
      .getRepository(RefreshTokenEntity)
      .update({ ...where, revokedAt: IsNull() }, { revokedAt: at, revokedReason: reason });
  }
}

function toSession(entity: SessionEntity): Session {
  return {
    id: entity.id,
    userId: entity.userId,
    userAgent: entity.userAgent,
    createdAt: entity.createdAt,
    lastUsedAt: entity.lastUsedAt,
    expiresAt: entity.expiresAt,
  };
}
