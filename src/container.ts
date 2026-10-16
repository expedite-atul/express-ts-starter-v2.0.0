/**
 * Composition root: the ONE place where objects are created and connected.
 *
 * Nothing else calls `new SomeService(...)`. Each class receives what it needs through its
 * constructor (dependency injection by hand, no framework), so a test can build the same
 * graph against a test database, or swap one piece.
 */
import type { DataSource } from 'typeorm';
import type { Env } from './config/env.ts';
import { UnitOfWork } from './repositories/unit-of-work.ts';
import { AuthService } from './services/auth.service.ts';
import { DepartmentService } from './services/department.service.ts';
import { EmployeeService } from './services/employee.service.ts';
import { PasswordHasher } from './services/password-hasher.ts';
import { PrivacyService } from './services/privacy.service.ts';
import { TokenService } from './services/token.service.ts';
import { UserService } from './services/user.service.ts';

export interface Services {
  auth: AuthService;
  departments: DepartmentService;
  employees: EmployeeService;
  privacy: PrivacyService;
  users: UserService;
}

export function createServices(dataSource: DataSource, config: Env): Services {
  const uow = new UnitOfWork(dataSource);
  const passwords = new PasswordHasher();
  const tokens = new TokenService(config);

  return {
    auth: new AuthService(uow, passwords, tokens),
    departments: new DepartmentService(uow),
    employees: new EmployeeService(uow, passwords),
    privacy: new PrivacyService(uow, config),
    users: new UserService(uow),
  };
}
