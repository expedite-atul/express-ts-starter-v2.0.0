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
import type { EmploymentStatus } from '../domain/employee.ts';
import { DepartmentEntity } from './department.entity.ts';

@Entity({ name: 'employees' })
// The database, not just the application, guarantees a work email is used only once.
@Unique('uq_employees_work_email', ['workEmail'])
@Check('chk_employees_work_email_lowercase', `"work_email" = lower("work_email")`)
@Check(
  'chk_employees_employment_status',
  `"employment_status" IN ('active', 'on_leave', 'inactive')`,
)
@Check(
  'chk_employees_names_not_blank',
  `length(trim("first_name")) > 0 AND length(trim("last_name")) > 0`,
)
@Check('chk_employees_not_own_manager', `"manager_id" IS NULL OR "manager_id" <> "id"`)
// A deactivated employee always has a deactivation date, and only a deactivated one does.
@Check(
  'chk_employees_deactivated_at',
  `("employment_status" = 'inactive') = ("deactivated_at" IS NOT NULL)`,
)
@Index('idx_employees_department_id', ['departmentId'])
@Index('idx_employees_manager_id', ['managerId'])
@Index('idx_employees_employment_status', ['employmentStatus'])
@Index('idx_employees_last_name_first_name', ['lastName', 'firstName'])
export class EmployeeEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_employees' })
  id!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ name: 'work_email', type: 'varchar', length: 254 })
  workEmail!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ name: 'department_id', type: 'uuid' })
  departmentId!: string;

  @ManyToOne(() => DepartmentEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'department_id', foreignKeyConstraintName: 'fk_employees_department' })
  department?: DepartmentEntity;

  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId!: string | null;

  @ManyToOne(() => EmployeeEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'manager_id', foreignKeyConstraintName: 'fk_employees_manager' })
  manager?: EmployeeEntity | null;

  @Column({ name: 'job_title', type: 'varchar', length: 100 })
  jobTitle!: string;

  /** A calendar date. TypeORM returns `date` columns as 'YYYY-MM-DD' strings. */
  @Column({ name: 'joining_date', type: 'date' })
  joiningDate!: string;

  @Column({ name: 'employment_status', type: 'varchar', length: 16, default: 'active' })
  employmentStatus!: EmploymentStatus;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt!: Date | null;

  /** Set by the retention job when personal data has been erased. */
  @Column({ name: 'anonymised_at', type: 'timestamptz', nullable: true })
  anonymisedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
