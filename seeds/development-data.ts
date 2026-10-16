/**
 * Development data: departments, employees and one login account per role.
 *
 * Every person here is FICTIONAL. Emails use example.com and phone numbers use the
 * 555-01xx range, both reserved for examples. Never put real employee data in a seed.
 * The automated tests and the Postman collection use these same accounts.
 */
import type { EntityManager } from 'typeorm';
import type { RoleName } from '../src/domain/role.ts';
import { DepartmentEntity } from '../src/entities/department.entity.ts';
import { EmployeeEntity } from '../src/entities/employee.entity.ts';
import { RoleEntity } from '../src/entities/role.entity.ts';
import { UserEntity } from '../src/entities/user.entity.ts';

/** Development-only password shared by all seeded accounts. Seeding refuses to run in production. */
export const DEV_PASSWORD = 'DevOnly-Passw0rd!';

export const DEPARTMENTS = [
  { name: 'Engineering', description: 'Builds and runs the product' },
  { name: 'Human Resources', description: 'People operations' },
  { name: 'Sales', description: 'Customer acquisition' },
  { name: 'Finance', description: 'Accounting and payroll administration' },
] as const;

type DepartmentName = (typeof DEPARTMENTS)[number]['name'];

interface SeedPerson {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: DepartmentName;
  jobTitle: string;
  joiningDate: string;
  managerKey: string | null;
  role: RoleName;
}

/** Managers come before their reports, so references can be resolved in order. */
export const PEOPLE = [
  { key: 'admin', firstName: 'Ada', lastName: 'Admin', email: 'admin@example.com', phone: '+1-555-0100', department: 'Engineering', jobTitle: 'Platform Administrator', joiningDate: '2020-01-06', managerKey: null, role: 'admin' },
  { key: 'hr', firstName: 'Harper', lastName: 'Hughes', email: 'hr@example.com', phone: '+1-555-0101', department: 'Human Resources', jobTitle: 'HR Partner', joiningDate: '2021-03-01', managerKey: null, role: 'hr' },
  { key: 'manager', firstName: 'Morgan', lastName: 'Miller', email: 'manager@example.com', phone: '+1-555-0102', department: 'Engineering', jobTitle: 'Engineering Manager', joiningDate: '2021-06-14', managerKey: null, role: 'manager' },
  { key: 'employee', firstName: 'Emery', lastName: 'Evans', email: 'employee@example.com', phone: '+1-555-0103', department: 'Engineering', jobTitle: 'Software Engineer', joiningDate: '2023-02-01', managerKey: 'manager', role: 'employee' },
  { key: 'employee2', firstName: 'Evan', lastName: 'Ellis', email: 'employee2@example.com', phone: '+1-555-0104', department: 'Engineering', jobTitle: 'QA Engineer', joiningDate: '2024-09-02', managerKey: 'manager', role: 'employee' },
  { key: 'salesManager', firstName: 'Sam', lastName: 'Sato', email: 'sales.manager@example.com', phone: '+1-555-0105', department: 'Sales', jobTitle: 'Sales Manager', joiningDate: '2022-01-10', managerKey: null, role: 'manager' },
  { key: 'salesRep', firstName: 'Olive', lastName: 'Ortiz', email: 'sales.rep@example.com', phone: '+1-555-0106', department: 'Sales', jobTitle: 'Account Executive', joiningDate: '2025-04-07', managerKey: 'salesManager', role: 'employee' },
] as const satisfies readonly SeedPerson[];

export type SeedPersonKey = (typeof PEOPLE)[number]['key'];

export interface SeededIds {
  departments: Record<DepartmentName, string>;
  employees: Record<SeedPersonKey, string>;
  users: Record<SeedPersonKey, string>;
}

/**
 * Inserts the development data, or updates it if it already exists (matched by name or
 * email), and returns the generated IDs. Needs reference data (roles) first.
 * `passwordHash` is computed once by the caller: hashing is deliberately slow.
 */
export async function seedDevelopmentData(
  manager: EntityManager,
  passwordHash: string,
): Promise<SeededIds> {
  const departments = manager.getRepository(DepartmentEntity);
  const employees = manager.getRepository(EmployeeEntity);
  const users = manager.getRepository(UserEntity);
  const roles = manager.getRepository(RoleEntity);

  await departments.upsert([...DEPARTMENTS], ['name']);
  const departmentIds = Object.fromEntries(
    (await departments.find()).map((d) => [d.name, d.id]),
  ) as SeededIds['departments'];
  const roleIds = new Map((await roles.find()).map((role) => [role.name, role.id]));

  const employeeIds = {} as SeededIds['employees'];
  const userIds = {} as SeededIds['users'];

  for (const person of PEOPLE) {
    await employees.upsert(
      {
        firstName: person.firstName,
        lastName: person.lastName,
        workEmail: person.email,
        phone: person.phone,
        departmentId: departmentIds[person.department],
        managerId: person.managerKey ? employeeIds[person.managerKey] : null,
        jobTitle: person.jobTitle,
        joiningDate: person.joiningDate,
        employmentStatus: 'active',
        deactivatedAt: null,
      },
      ['workEmail'],
    );
    const employee = await employees.findOneByOrFail({ workEmail: person.email });
    employeeIds[person.key] = employee.id;

    const roleId = roleIds.get(person.role);
    if (!roleId) throw new Error(`Role ${person.role} is missing: seed reference data first`);
    await users.upsert(
      { email: person.email, passwordHash, roleId, employeeId: employee.id, isActive: true },
      ['email'],
    );
    userIds[person.key] = (await users.findOneByOrFail({ email: person.email })).id;
  }

  return { departments: departmentIds, employees: employeeIds, users: userIds };
}
