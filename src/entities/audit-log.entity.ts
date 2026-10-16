import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AuditAction, AuditResourceType } from '../domain/audit.ts';
import { UserEntity } from './user.entity.ts';

/** Append-only record of sensitive actions. Never stores personal data values. */
@Entity({ name: 'audit_logs' })
@Index('idx_audit_logs_timestamp', ['timestamp'])
@Index('idx_audit_logs_resource', ['resourceType', 'resourceId'])
@Index('idx_audit_logs_actor_user_id', ['actorUserId'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_audit_logs' })
  id!: string;

  /** Null for system actions, or after the actor's account was erased (ON DELETE SET NULL). */
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_user_id', foreignKeyConstraintName: 'fk_audit_logs_actor' })
  actor?: UserEntity | null;

  @Column({ type: 'varchar', length: 64 })
  action!: AuditAction;

  @Column({ name: 'resource_type', type: 'varchar', length: 32 })
  resourceType!: AuditResourceType;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId!: string | null;

  @CreateDateColumn({ name: 'timestamp', type: 'timestamptz' })
  timestamp!: Date;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  requestId!: string | null;

  /** Field names, role names or reasons. Never values such as names, emails or phones. */
  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
