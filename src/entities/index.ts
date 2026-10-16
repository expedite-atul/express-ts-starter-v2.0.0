import { AuditLogEntity } from './audit-log.entity.ts';
import { DepartmentEntity } from './department.entity.ts';
import { EmployeeEntity } from './employee.entity.ts';
import { PermissionEntity } from './permission.entity.ts';
import { RefreshTokenEntity } from './refresh-token.entity.ts';
import { RolePermissionEntity } from './role-permission.entity.ts';
import { RoleEntity } from './role.entity.ts';
import { SessionEntity } from './session.entity.ts';
import { UserEntity } from './user.entity.ts';

export {
  AuditLogEntity,
  DepartmentEntity,
  EmployeeEntity,
  PermissionEntity,
  RefreshTokenEntity,
  RolePermissionEntity,
  RoleEntity,
  SessionEntity,
  UserEntity,
};

/** Registered with the DataSource. A new entity must be added here. */
export const ENTITIES = [
  DepartmentEntity,
  EmployeeEntity,
  RoleEntity,
  PermissionEntity,
  RolePermissionEntity,
  UserEntity,
  SessionEntity,
  RefreshTokenEntity,
  AuditLogEntity,
];
