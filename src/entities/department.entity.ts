import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Persistence model for the `departments` table.
 *
 * Entities describe TABLES. They are used only inside repositories, which map them to the
 * plain domain types in src/domain. Every constraint has an explicit name so the generated
 * migration is readable and database errors can be translated (see database-errors.ts).
 */
@Entity({ name: 'departments' })
@Unique('uq_departments_name', ['name'])
@Check('chk_departments_name_not_blank', `length(trim("name")) > 0`)
export class DepartmentEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_departments' })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
