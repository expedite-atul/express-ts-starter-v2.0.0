/**
 * Reference data every environment needs: roles, permissions and the role → permission
 * matrix. Idempotent: running it again updates descriptions and re-syncs the matrix.
 */
import type { EntityManager } from 'typeorm';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, type Permission } from '../src/domain/permission.ts';
import { ROLE_DESCRIPTIONS, ROLES } from '../src/domain/role.ts';
import { PermissionEntity } from '../src/entities/permission.entity.ts';
import { RolePermissionEntity } from '../src/entities/role-permission.entity.ts';
import { RoleEntity } from '../src/entities/role.entity.ts';

export async function seedReferenceData(manager: EntityManager): Promise<void> {
  const roles = manager.getRepository(RoleEntity);
  const permissions = manager.getRepository(PermissionEntity);
  const rolePermissions = manager.getRepository(RolePermissionEntity);

  await roles.upsert(
    ROLES.map((name) => ({ name, description: ROLE_DESCRIPTIONS[name] })),
    ['name'],
  );
  await permissions.upsert(
    Object.entries(PERMISSIONS).map(([name, description]) => ({ name, description })),
    ['name'],
  );

  const roleIds = new Map((await roles.find()).map((role) => [role.name, role.id]));
  const permissionIds = new Map((await permissions.find()).map((p) => [p.name, p.id]));

  // Replace each role's grants with exactly the matrix in src/domain/permission.ts.
  for (const role of ROLES) {
    const roleId = roleIds.get(role);
    if (!roleId) throw new Error(`Role ${role} was not created`);
    await rolePermissions.delete({ roleId });
    await rolePermissions.insert(
      DEFAULT_ROLE_PERMISSIONS[role].map((permission: Permission) => {
        const permissionId = permissionIds.get(permission);
        if (!permissionId) throw new Error(`Permission ${permission} was not created`);
        return { roleId, permissionId };
      }),
    );
  }
}
