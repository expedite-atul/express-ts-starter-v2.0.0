import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { RevocationReason } from '../domain/session.ts';
import { UserEntity } from './user.entity.ts';

/**
 * One row per login session (= refresh-token family). Not in the assignment's table list:
 * added so a session can be listed and revoked as a unit, and so `authenticate` can check
 * "is this session still valid?" with one indexed lookup per request.
 */
@Entity({ name: 'sessions' })
@Index('idx_sessions_user_id', ['userId'])
@Check('chk_sessions_revocation', `("revoked_at" IS NULL) = ("revoked_reason" IS NULL)`)
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_sessions' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_sessions_user' })
  user?: UserEntity;

  /** Helps people recognise their sessions in "active sessions". Truncated; no IP stored. */
  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz' })
  lastUsedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoked_reason', type: 'varchar', length: 32, nullable: true })
  revokedReason!: RevocationReason | null;
}
