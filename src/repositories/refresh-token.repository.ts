import type { EntityManager, Repository } from 'typeorm';
import type { RevocationReason } from '../domain/session.ts';
import { RefreshTokenEntity } from '../entities/refresh-token.entity.ts';

export interface StoredRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export class RefreshTokenRepository {
  private readonly repo: Repository<RefreshTokenEntity>;

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(RefreshTokenEntity);
  }

  async create(input: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.repo.insert({ ...input, revokedAt: null, revokedReason: null });
  }

  /**
   * Finds a token by its hash and LOCKS the row until the transaction ends
   * (SELECT ... FOR UPDATE). Two simultaneous refreshes with the same token are therefore
   * processed one after the other: the second sees the token already used.
   * Must be called inside `unitOfWork.transaction(...)`.
   */
  async findByHashForUpdate(tokenHash: string): Promise<StoredRefreshToken | null> {
    const entity = await this.repo
      .createQueryBuilder('token')
      .setLock('pessimistic_write')
      .where('token.tokenHash = :tokenHash', { tokenHash })
      .getOne();
    return entity
      ? {
          id: entity.id,
          userId: entity.userId,
          familyId: entity.familyId,
          expiresAt: entity.expiresAt,
          revokedAt: entity.revokedAt,
        }
      : null;
  }

  async revoke(id: string, reason: RevocationReason, at: Date): Promise<void> {
    await this.repo.update({ id }, { revokedAt: at, revokedReason: reason });
  }
}
