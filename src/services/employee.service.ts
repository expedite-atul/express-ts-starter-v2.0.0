import { hasPermission, type Actor } from '../domain/actor.ts';
import {
  EDITABLE_FIELDS,
  type Employee,
  type EmployeeChanges,
  type EmployeeField,
  type EmployeeListQuery,
  type NewEmployee,
} from '../domain/employee.ts';
import { employeeAccess, viewFor, type EmployeeView } from '../domain/employee-access.ts';
import { toPage, type Page } from '../domain/pagination.ts';
import { canAssignRole, type RoleName } from '../domain/role.ts';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors/app-error.ts';
import type { Repositories, UnitOfWork } from '../repositories/unit-of-work.ts';
import type { PasswordHasher } from './password-hasher.ts';

export interface CreateEmployeeInput extends NewEmployee {
  /** Optional login account, created in the same transaction as the employee. */
  account?: { role: RoleName; password: string };
}

/**
 * Employee management (Module A) with object- and property-level authorisation (Module C).
 * Routes have already checked the permission; this service decides WHICH records and
 * WHICH fields.
 */
export class EmployeeService {
  private readonly uow: UnitOfWork;
  private readonly passwords: PasswordHasher;

  constructor(uow: UnitOfWork, passwords: PasswordHasher) {
    this.uow = uow;
    this.passwords = passwords;
  }

  /**
   * Creates the employee, optionally its login account, and an audit entry, in ONE
   * transaction: if any step fails (duplicate email, unknown role, ...), nothing is saved.
   */
  async create(actor: Actor, input: CreateEmployeeInput): Promise<Employee> {
    const { account, ...employee } = input;
    if (account && !canAssignRole(actor.role, account.role)) {
      throw new ForbiddenError(`You may not create accounts with the "${account.role}" role`);
    }
    await this.assertValidReferences(this.uow.repositories, employee);

    // Hash before opening the transaction: hashing is slow and holds no locks.
    const passwordHash = account ? await this.passwords.hash(account.password) : undefined;

    return this.uow.transaction(async (tx) => {
      const id = await tx.employees.create(employee);
      if (account && passwordHash) {
        await tx.users.create({
          email: employee.workEmail,
          passwordHash,
          roleId: await tx.roles.getIdByName(account.role),
          employeeId: id,
        });
      }
      await tx.auditLogs.record({
        actorUserId: actor.userId,
        action: 'employee.create',
        resourceType: 'employee',
        resourceId: id,
        requestId: actor.requestId,
        metadata: account ? { accountRole: account.role } : {},
      });
      return getOrFail(tx, id);
    });
  }

  /** admin/HR: everyone. Manager: direct reports only (applied in the query itself). */
  async list(actor: Actor, query: EmployeeListQuery): Promise<Page<Employee>> {
    let scope: { managerId?: string };
    if (hasPermission(actor, 'employee:access-all')) {
      scope = {};
    } else if (hasPermission(actor, 'employee:access-team') && actor.employeeId !== null) {
      scope = { managerId: actor.employeeId };
    } else {
      throw new ForbiddenError();
    }
    const { items, total } = await this.uow.repositories.employees.list(query, scope);
    return toPage(items, total, query);
  }

  async getById(actor: Actor, id: string): Promise<{ employee: Employee; view: EmployeeView }> {
    const employee = await this.uow.repositories.employees.findById(id);
    const access = employee ? employeeAccess(actor, employee) : 'none';
    if (!employee || access === 'none') throw new NotFoundError('Employee');
    return { employee, view: viewFor(access) };
  }

  async update(
    actor: Actor,
    id: string,
    changes: EmployeeChanges,
  ): Promise<{ employee: Employee; view: EmployeeView }> {
    const current = await this.uow.repositories.employees.findById(id);
    const access = current ? employeeAccess(actor, current) : 'none';
    if (!current || access === 'none') throw new NotFoundError('Employee');
    if (access === 'self') {
      throw new ForbiddenError('Use PATCH /api/v1/employees/me to update your own profile');
    }
    assertFieldsAllowed(changes, access === 'all' ? EDITABLE_FIELDS.all : EDITABLE_FIELDS.team);
    if (current.employmentStatus === 'inactive') {
      throw new BusinessRuleError('A deactivated employee cannot be updated');
    }
    await this.assertValidReferences(this.uow.repositories, changes, id);

    const employee = await this.uow.transaction(async (tx) => {
      await tx.employees.update(id, changes);
      // The login email follows the work email, in the same transaction.
      if (changes.workEmail !== undefined && changes.workEmail !== current.workEmail) {
        const account = await tx.users.findByEmployeeId(id);
        if (account) await tx.users.updateEmail(account.id, changes.workEmail);
      }
      await tx.auditLogs.record({
        actorUserId: actor.userId,
        action: 'employee.update',
        resourceType: 'employee',
        resourceId: id,
        requestId: actor.requestId,
        metadata: { fields: Object.keys(changes) }, // field names only, never values
      });
      return getOrFail(tx, id);
    });
    return { employee, view: viewFor(access) };
  }

  /**
   * "Delete" = deactivate: the record stays (history, retention rules), the account is
   * disabled and every session is revoked at once, all in one transaction.
   */
  async deactivate(actor: Actor, id: string): Promise<void> {
    const employee = await this.uow.repositories.employees.findById(id);
    if (!employee || employeeAccess(actor, employee) !== 'all') throw new NotFoundError('Employee');
    if (id === actor.employeeId) throw new BusinessRuleError('You cannot deactivate yourself');
    if (employee.employmentStatus === 'inactive') return; // already done: idempotent

    const reports = await this.uow.repositories.employees.countActiveDirectReports(id);
    if (reports > 0) {
      throw new ConflictError(
        `This employee manages ${reports} active employee(s). Assign them a new manager first.`,
      );
    }

    await this.uow.transaction(async (tx) => {
      const now = new Date();
      await tx.employees.deactivate(id, now);
      const account = await tx.users.findByEmployeeId(id);
      let sessionsRevoked = 0;
      if (account) {
        await tx.users.deactivate(account.id);
        sessionsRevoked = await tx.sessions.revokeAllForUser(account.id, 'deactivated', now);
      }
      await tx.auditLogs.record({
        actorUserId: actor.userId,
        action: 'employee.deactivate',
        resourceType: 'employee',
        resourceId: id,
        requestId: actor.requestId,
        metadata: { accountDisabled: account !== null, sessionsRevoked },
      });
    });
  }

  async getOwnProfile(actor: Actor): Promise<Employee> {
    if (actor.employeeId === null) throw new NotFoundError('Profile');
    const employee = await this.uow.repositories.employees.findById(actor.employeeId);
    if (!employee) throw new NotFoundError('Profile');
    return employee;
  }

  /** Self-service: only EDITABLE_FIELDS.self (name and phone). Never role, department or status. */
  async updateOwnProfile(actor: Actor, changes: EmployeeChanges): Promise<Employee> {
    assertFieldsAllowed(changes, EDITABLE_FIELDS.self);
    const employeeId = (await this.getOwnProfile(actor)).id;
    return this.uow.transaction(async (tx) => {
      await tx.employees.update(employeeId, changes);
      await tx.auditLogs.record({
        actorUserId: actor.userId,
        action: 'profile.update',
        resourceType: 'employee',
        resourceId: employeeId,
        requestId: actor.requestId,
        metadata: { fields: Object.keys(changes) },
      });
      return getOrFail(tx, employeeId);
    });
  }

  /**
   * Friendly checks before writing. The database enforces the same references with foreign
   * keys (and translates violations), so a race between check and write is still safe.
   */
  private async assertValidReferences(
    repos: Repositories,
    input: { departmentId?: string; managerId?: string | null },
    employeeId?: string,
  ): Promise<void> {
    if (input.departmentId !== undefined && !(await repos.departments.exists(input.departmentId))) {
      throw new BusinessRuleError('The department does not exist', [
        { path: 'body.departmentId', message: 'does not exist' },
      ]);
    }
    if (input.managerId === undefined || input.managerId === null) return;

    if (input.managerId === employeeId) {
      throw new BusinessRuleError('An employee cannot manage themselves', [
        { path: 'body.managerId', message: 'cannot be the employee themselves' },
      ]);
    }
    const manager = await repos.employees.findById(input.managerId);
    if (!manager || manager.employmentStatus === 'inactive') {
      throw new BusinessRuleError('The manager does not exist or is deactivated', [
        { path: 'body.managerId', message: 'does not exist or is deactivated' },
      ]);
    }
    if (employeeId && (await repos.employees.wouldCreateManagementCycle(employeeId, input.managerId))) {
      throw new BusinessRuleError('This change would create a management cycle', [
        { path: 'body.managerId', message: 'reports (directly or indirectly) to this employee' },
      ]);
    }
  }
}

/** Property-level authorisation: every changed field must be on the caller's list. */
function assertFieldsAllowed(changes: EmployeeChanges, allowed: readonly EmployeeField[]): void {
  const forbidden = (Object.keys(changes) as EmployeeField[]).filter((field) => !allowed.includes(field));
  if (forbidden.length > 0) {
    throw new ForbiddenError(
      'You may not change some of these fields',
      forbidden.map((field) => ({ path: `body.${field}`, message: 'you may not change this field' })),
    );
  }
}

async function getOrFail(repos: Repositories, id: string): Promise<Employee> {
  const employee = await repos.employees.findById(id);
  if (!employee) throw new NotFoundError('Employee');
  return employee;
}
