import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { PermissionEntity } from './permission.entity.ts';
import { RoleEntity } from './role.entity.ts';

/** Join table: which permissions each role grants. Composite primary key (role, permission). */
@Entity({ name: 'role_permissions' })
@Index('idx_role_permissions_permission_id', ['permissionId'])
export class RolePermissionEntity {
  @PrimaryColumn({ name: 'role_id', type: 'uuid', primaryKeyConstraintName: 'pk_role_permissions' })
  roleId!: string;

  @PrimaryColumn({
    name: 'permission_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_role_permissions',
  })
  permissionId!: string;

  @ManyToOne(() => RoleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id', foreignKeyConstraintName: 'fk_role_permissions_role' })
  role?: RoleEntity;

  @ManyToOne(() => PermissionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'permission_id',
    foreignKeyConstraintName: 'fk_role_permissions_permission',
  })
  permission?: PermissionEntity;
}
