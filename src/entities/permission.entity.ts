import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'permissions' })
@Unique('uq_permissions_name', ['name'])
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_permissions' })
  id!: string;

  /** `resource:action`, e.g. `employee:update`. */
  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  description!: string;
}
