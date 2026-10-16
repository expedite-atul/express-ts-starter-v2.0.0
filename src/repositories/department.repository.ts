import type { EntityManager, Repository } from 'typeorm';
import type { Department, DepartmentChanges, NewDepartment } from '../domain/department.ts';
import type { PageRequest } from '../domain/pagination.ts';
import { DepartmentEntity } from '../entities/department.entity.ts';

export class DepartmentRepository {
  private readonly repo: Repository<DepartmentEntity>;

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(DepartmentEntity);
  }

  async findById(id: string): Promise<Department | null> {
    const entity = await this.repo.findOneBy({ id });
    return entity ? toDepartment(entity) : null;
  }

  async exists(id: string): Promise<boolean> {
    return this.repo.existsBy({ id });
  }

  async list(page: PageRequest): Promise<{ items: Department[]; total: number }> {
    const [entities, total] = await this.repo.findAndCount({
      order: { name: 'ASC', id: 'ASC' },
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    });
    return { items: entities.map(toDepartment), total };
  }

  async create(input: NewDepartment): Promise<Department> {
    const entity = await this.repo.save(
      this.repo.create({ name: input.name, description: input.description ?? null }),
    );
    return toDepartment(entity);
  }

  async update(id: string, changes: DepartmentChanges): Promise<void> {
    await this.repo.update({ id }, changes);
  }
}

function toDepartment(entity: DepartmentEntity): Department {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
