import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { RevocationReason } from '../domain/session.ts';
import { SessionEntity } from './session.entity.ts';
import { UserEntity } from './user.entity.ts';

/**
 * One row per refresh token ever issued. Only the SHA-256 hash of the token is stored:
 * someone who reads this table still cannot use a token.
 * `revoked_at` is set when the token is rotated (used) or revoked. Presenting a token
 * whose `revoked_at` is set is a replay, and revokes the whole family (session).
 */
@Entity({ name: 'refresh_tokens' })
@Unique('uq_refresh_tokens_token_hash', ['tokenHash'])
@Index('idx_refresh_tokens_user_id', ['userId'])
@Index('idx_refresh_tokens_family_id', ['familyId'])
@Check('chk_refresh_tokens_revocation', `("revoked_at" IS NULL) = ("revoked_reason" IS NULL)`)
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_refresh_tokens' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_refresh_tokens_user' })
  user?: UserEntity;

  /** Hex SHA-256 of the token (64 characters). */
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  /** The session this token belongs to. */
  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @ManyToOne(() => SessionEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id', foreignKeyConstraintName: 'fk_refresh_tokens_family' })
  family?: SessionEntity;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revoked_reason', type: 'varchar', length: 32, nullable: true })
  revokedReason!: RevocationReason | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
