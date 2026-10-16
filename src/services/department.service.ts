import type { Actor } from '../domain/actor.ts';
import type { Department, DepartmentChanges, NewDepartment } from '../domain/department.ts';
import { toPage, type Page, type PageRequest } from '../domain/pagination.ts';
import { NotFoundError } from '../errors/app-error.ts';
import type { UnitOfWork } from '../repositories/unit-of-work.ts';

export class DepartmentService {
  private readonly uow: UnitOfWork;

  constructor(uow: UnitOfWork) {
    this.uow = uow;
  }

  async list(page: PageRequest): Promise<Page<Department>> {
    const { items, total } = await this.uow.repositories.departments.list(page);
    return toPage(items, total, page);
  }

  /** A duplicate name is rejected by the unique constraint (409), even under concurrency. */
  async create(actor: Actor, input: NewDepartment): Promise<Department> {
    return this.uow.transaction(async (tx) => {
      const department = await tx.departments.create(input);
      await tx.auditLogs.record({
        actorUserId: actor.userId,
        action: 'department.create',
        resourceType: 'department',
        resourceId: department.id,
        requestId: actor.requestId,
      });
      return department;
    });
  }

  async update(actor: Actor, id: string, changes: DepartmentChanges): Promise<Department> {
    return this.uow.transaction(async (tx) => {
      if (!(await tx.departments.exists(id))) throw new NotFoundError('Department');
      await tx.departments.update(id, changes);
      await tx.auditLogs.record({
        actorUserId: actor.userId,
        action: 'department.update',
        resourceType: 'department',
        resourceId: id,
        requestId: actor.requestId,
        metadata: { fields: Object.keys(changes) },
      });
      const department = await tx.departments.findById(id);
      if (!department) throw new NotFoundError('Department');
      return department;
    });
  }
}
