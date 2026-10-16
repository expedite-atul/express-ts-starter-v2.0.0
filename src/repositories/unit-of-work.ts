/**
 * Unit of Work: the one door services use to reach the database.
 *
 * - `uow.repositories` — repositories for single reads and writes.
 * - `uow.transaction(async (tx) => { ... })` — repositories that all share ONE database
 *   transaction. If the callback throws, every change inside it is rolled back.
 *
 * Services never import TypeORM: they see plain repository methods and domain objects,
 * so the business rules do not depend on the ORM (dependency inversion).
 */
import type { DataSource, EntityManager } from 'typeorm';
import { AuditLogRepository } from './audit-log.repository.ts';
import { translateDatabaseError } from './database-errors.ts';
import { DepartmentRepository } from './department.repository.ts';
import { EmployeeRepository } from './employee.repository.ts';
import { RefreshTokenRepository } from './refresh-token.repository.ts';
import { RoleRepository } from './role.repository.ts';
import { SessionRepository } from './session.repository.ts';
import { UserRepository } from './user.repository.ts';

export interface Repositories {
  auditLogs: AuditLogRepository;
  departments: DepartmentRepository;
  employees: EmployeeRepository;
  refreshTokens: RefreshTokenRepository;
  roles: RoleRepository;
  sessions: SessionRepository;
  users: UserRepository;
}

function createRepositories(manager: EntityManager): Repositories {
  return {
    auditLogs: new AuditLogRepository(manager),
    departments: new DepartmentRepository(manager),
    employees: new EmployeeRepository(manager),
    refreshTokens: new RefreshTokenRepository(manager),
    roles: new RoleRepository(manager),
    sessions: new SessionRepository(manager),
    users: new UserRepository(manager),
  };
}

export class UnitOfWork {
  private readonly dataSource: DataSource;
  readonly repositories: Repositories;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.repositories = createRepositories(dataSource.manager);
  }

  /**
   * Runs `work` in a transaction (BEGIN ... COMMIT, or ROLLBACK if it throws).
   * Constraint violations are translated into API errors (409 / 422).
   */
  async transaction<T>(work: (tx: Repositories) => Promise<T>): Promise<T> {
    try {
      return await this.dataSource.transaction((manager) => work(createRepositories(manager)));
    } catch (error) {
      throw translateDatabaseError(error);
    }
  }
}
