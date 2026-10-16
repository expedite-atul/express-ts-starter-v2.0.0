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
  UpdateDateColumn,
} from 'typeorm';
import { EmployeeEntity } from './employee.entity.ts';
import { RoleEntity } from './role.entity.ts';

@Entity({ name: 'users' })
@Unique('uq_users_email', ['email'])
@Unique('uq_users_employee_id', ['employeeId']) // one login account per employee
@Check('chk_users_email_lowercase', `"email" = lower("email")`)
@Index('idx_users_role_id', ['roleId'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_users' })
  id!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  /**
   * Argon2id hash. `select: false`: TypeORM leaves it out of every query unless a
   * repository asks for it explicitly, so it cannot leak by accident.
   */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => RoleEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id', foreignKeyConstraintName: 'fk_users_role' })
  role?: RoleEntity;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId!: string | null;

  // ManyToOne + the named unique constraint above = "at most one account per employee".
  // (@OneToOne would add a second, auto-named unique constraint on the same column.)
  @ManyToOne(() => EmployeeEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employee_id', foreignKeyConstraintName: 'fk_users_employee' })
  employee?: EmployeeEntity | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
