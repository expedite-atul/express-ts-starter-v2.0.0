import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { RoleName } from '../domain/role.ts';

@Entity({ name: 'roles' })
@Unique('uq_roles_name', ['name'])
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_roles' })
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  name!: RoleName;

  @Column({ type: 'varchar', length: 255 })
  description!: string;
}
