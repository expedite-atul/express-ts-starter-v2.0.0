import { Brackets, type EntityManager, type Repository, type SelectQueryBuilder } from 'typeorm';
import type {
  Employee,
  EmployeeChanges,
  EmployeeListQuery,
  EmployeeSortField,
  NewEmployee,
} from '../domain/employee.ts';
import { EmployeeEntity } from '../entities/employee.entity.ts';

/**
 * Sorting allowlist: API field name → query-builder column. Only these keys can ever reach
 * ORDER BY, so a crafted `sortBy` cannot inject SQL (validators also reject unknown values).
 */
const SORT_COLUMNS: Record<EmployeeSortField, string> = {
  lastName: 'employee.lastName',
  firstName: 'employee.firstName',
  joiningDate: 'employee.joiningDate',
  createdAt: 'employee.createdAt',
};

export class EmployeeRepository {
  private readonly manager: EntityManager;
  private readonly repo: Repository<EmployeeEntity>;

  constructor(manager: EntityManager) {
    this.manager = manager;
    this.repo = manager.getRepository(EmployeeEntity);
  }

  async findById(id: string): Promise<Employee | null> {
    const entity = await this.withRelations().where('employee.id = :id', { id }).getOne();
    return entity ? toEmployee(entity) : null;
  }

  /**
   * One page of employees. Every value from the request is passed as a bound parameter
   * (`:name` placeholders), never concatenated into the SQL text.
   * `scope.managerId` limits the result to that manager's direct reports.
   */
  async list(
    query: EmployeeListQuery,
    scope: { managerId?: string } = {},
  ): Promise<{ items: Employee[]; total: number }> {
    const qb = this.withRelations();

    if (scope.managerId !== undefined) {
      qb.andWhere('employee.managerId = :managerId', { managerId: scope.managerId });
    }
    if (query.departmentId !== undefined) {
      qb.andWhere('employee.departmentId = :departmentId', { departmentId: query.departmentId });
    }
    if (query.employmentStatus !== undefined) {
      qb.andWhere('employee.employmentStatus = :status', { status: query.employmentStatus });
    } else {
      // Deactivated employees are hidden unless explicitly requested with ?employmentStatus=inactive.
      qb.andWhere('employee.employmentStatus <> :inactive', { inactive: 'inactive' });
    }
    if (query.search !== undefined) {
      const search = `%${escapeLikePattern(query.search)}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('employee.firstName ILIKE :search', { search })
            .orWhere('employee.lastName ILIKE :search', { search })
            .orWhere('employee.workEmail ILIKE :search', { search })
            .orWhere('employee.jobTitle ILIKE :search', { search });
        }),
      );
    }

    qb.orderBy(SORT_COLUMNS[query.sortBy], query.sortOrder === 'asc' ? 'ASC' : 'DESC')
      .addOrderBy('employee.id', 'ASC') // tie-breaker: stable pages
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [entities, total] = await qb.getManyAndCount();
    return { items: entities.map(toEmployee), total };
  }

  async create(input: NewEmployee): Promise<string> {
    const entity = await this.repo.save(this.repo.create({ ...input, deactivatedAt: null }));
    return entity.id;
  }

  async update(id: string, changes: EmployeeChanges): Promise<void> {
    await this.repo.update({ id }, changes);
  }

  async deactivate(id: string, at: Date): Promise<void> {
    await this.repo.update({ id }, { employmentStatus: 'inactive', deactivatedAt: at });
  }

  async countActiveDirectReports(managerId: string): Promise<number> {
    return this.repo
      .createQueryBuilder('employee')
      .where('employee.managerId = :managerId', { managerId })
      .andWhere('employee.employmentStatus <> :inactive', { inactive: 'inactive' })
      .getCount();
  }

  /**
   * Would making `managerId` the manager of `employeeId` create a loop
   * (A manages B manages A)? Walks up the management chain with a recursive query.
   * Raw SQL with positional parameters ($1, $2): still parameterised, never concatenated.
   */
  async wouldCreateManagementCycle(employeeId: string, managerId: string): Promise<boolean> {
    const rows: unknown[] = await this.manager.query(
      `WITH RECURSIVE chain AS (
         SELECT id, manager_id, 1 AS depth FROM employees WHERE id = $1
         UNION ALL
         SELECT e.id, e.manager_id, chain.depth + 1
         FROM employees e JOIN chain ON e.id = chain.manager_id
         WHERE chain.depth < 1000
       )
       SELECT 1 FROM chain WHERE id = $2 LIMIT 1`,
      [managerId, employeeId],
    );
    return rows.length > 0;
  }

  /** Deactivated employees whose retention period has passed and who are not yet erased. */
  async findIdsDueForAnonymisation(deactivatedBefore: Date): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('employee')
      .select('employee.id', 'id')
      .where('employee.employmentStatus = :inactive', { inactive: 'inactive' })
      .andWhere('employee.deactivatedAt < :before', { before: deactivatedBefore })
      .andWhere('employee.anonymisedAt IS NULL')
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  /** Erases personal data but keeps the row, so history (departments, reporting lines) stays consistent. */
  async anonymise(id: string, at: Date): Promise<void> {
    await this.repo.update(
      { id },
      {
        firstName: 'Former',
        lastName: 'Employee',
        workEmail: `erased-${id}@invalid.invalid`,
        phone: null,
        anonymisedAt: at,
      },
    );
  }

  private withRelations(): SelectQueryBuilder<EmployeeEntity> {
    return this.repo
      .createQueryBuilder('employee')
      .innerJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.manager', 'manager');
  }
}

/** Entity → domain object. Only the fields the application uses are copied. */
function toEmployee(entity: EmployeeEntity): Employee {
  if (!entity.department) throw new Error('Employee loaded without its department');
  return {
    id: entity.id,
    firstName: entity.firstName,
    lastName: entity.lastName,
    workEmail: entity.workEmail,
    phone: entity.phone,
    department: { id: entity.department.id, name: entity.department.name },
    manager: entity.manager
      ? { id: entity.manager.id, firstName: entity.manager.firstName, lastName: entity.manager.lastName }
      : null,
    jobTitle: entity.jobTitle,
    joiningDate: entity.joiningDate,
    employmentStatus: entity.employmentStatus,
    deactivatedAt: entity.deactivatedAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/** `%` and `_` are wildcards in LIKE patterns; escape them so a search matches them literally. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
