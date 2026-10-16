/**
 * Response shapes. Each field is copied explicitly: nothing reaches the client just because
 * it exists on a domain object (data minimisation, property-level authorisation).
 */
import type { Employee } from '../domain/employee.ts';
import type { EmployeeView } from '../domain/employee-access.ts';

export interface EmployeeResponse {
  id: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  /** Present in the `full` view only (self, admin, HR). */
  phone?: string | null;
  department: { id: string; name: string };
  manager: { id: string; firstName: string; lastName: string } | null;
  jobTitle: string;
  joiningDate: string;
  employmentStatus: string;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toEmployeeResponse(employee: Employee, view: EmployeeView): EmployeeResponse {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    workEmail: employee.workEmail,
    ...(view === 'full' ? { phone: employee.phone } : {}),
    department: { id: employee.department.id, name: employee.department.name },
    manager: employee.manager
      ? { id: employee.manager.id, firstName: employee.manager.firstName, lastName: employee.manager.lastName }
      : null,
    jobTitle: employee.jobTitle,
    joiningDate: employee.joiningDate,
    employmentStatus: employee.employmentStatus,
    deactivatedAt: employee.deactivatedAt?.toISOString() ?? null,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
}

/** List items: directory information only, never phone numbers. */
export interface EmployeeSummaryResponse {
  id: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  jobTitle: string;
  department: { id: string; name: string };
  managerId: string | null;
  employmentStatus: string;
}

export function toEmployeeSummary(employee: Employee): EmployeeSummaryResponse {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    workEmail: employee.workEmail,
    jobTitle: employee.jobTitle,
    department: { id: employee.department.id, name: employee.department.name },
    managerId: employee.manager?.id ?? null,
    employmentStatus: employee.employmentStatus,
  };
}
