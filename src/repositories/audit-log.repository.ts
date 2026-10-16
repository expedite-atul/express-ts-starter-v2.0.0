import { LessThan, type EntityManager, type Repository } from 'typeorm';
import type { AuditEntry, AuditRecord } from '../domain/audit.ts';
import { AuditLogEntity } from '../entities/audit-log.entity.ts';

export class AuditLogRepository {
  private readonly repo: Repository<AuditLogEntity>;

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(AuditLogEntity);
  }

  /** Call inside the same transaction as the change being recorded. */
  async record(entry: AuditEntry): Promise<void> {
    await this.repo.insert({ ...entry, metadata: entry.metadata ?? {} });
  }

  async listByActor(actorUserId: string, limit: number): Promise<AuditRecord[]> {
    const entities = await this.repo.find({
      where: { actorUserId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
    return entities.map((entity) => ({
      id: entity.id,
      actorUserId: entity.actorUserId,
      action: entity.action,
      resourceType: entity.resourceType,
      resourceId: entity.resourceId,
      requestId: entity.requestId,
      metadata: entity.metadata as AuditRecord['metadata'],
      timestamp: entity.timestamp,
    }));
  }

  /** Retention: removes entries older than the cut-off. Returns how many were deleted. */
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.repo.delete({ timestamp: LessThan(cutoff) });
    return result.affected ?? 0;
  }
}
