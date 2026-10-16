import type { EntityManager, Repository } from 'typeorm';
import type { RoleName } from '../domain/role.ts';
import { RoleEntity } from '../entities/role.entity.ts';

export class RoleRepository {
  private readonly repo: Repository<RoleEntity>;

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(RoleEntity);
  }

  /** Throws if the role is missing: roles are reference data created by `npm run db:seed`. */
  async getIdByName(name: RoleName): Promise<string> {
    const role = await this.repo.findOneBy({ name });
    if (!role) throw new Error(`Role "${name}" is missing. Run npm run db:seed.`);
    return role.id;
  }
}
