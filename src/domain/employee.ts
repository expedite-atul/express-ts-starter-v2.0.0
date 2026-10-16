/**
 * `inactive` means deactivated (assignment: "deletion should normally mean deactivation").
 * It is set only by the deactivate operation, never by a normal update.
 */
export const EMPLOYMENT_STATUSES = ['active', 'on_leave', 'inactive'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** Statuses a normal update may set. Deactivation has its own endpoint. */
export const UPDATABLE_STATUSES = ['active', 'on_leave'] as const;

export interface EmployeeRef {
  id: string;
  firstName: string;
  lastName: string;
}

/** An employee as the rest of the application sees it (no persistence details). */
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  phone: string | null;
  department: { id: string; name: string };
  manager: EmployeeRef | null;
  jobTitle: string;
  /** Calendar date, YYYY-MM-DD. */
  joiningDate: string;
  employmentStatus: EmploymentStatus;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewEmployee {
  firstName: string;
  lastName: string;
  workEmail: string;
  phone: string | null;
  departmentId: string;
  managerId: string | null;
  jobTitle: string;
  joiningDate: string;
  employmentStatus: Exclude<EmploymentStatus, 'inactive'>;
}

export interface EmployeeChanges {
  firstName?: string;
  lastName?: string;
  workEmail?: string;
  phone?: string | null;
  departmentId?: string;
  managerId?: string | null;
  jobTitle?: string;
  joiningDate?: string;
  employmentStatus?: Exclude<EmploymentStatus, 'inactive'>;
}

export type EmployeeField = keyof EmployeeChanges;

/**
 * Property-level authorisation: which fields each kind of editor may change.
 * Anything else in a request is rejected, so `"role": "admin"` or `"salary"` can never
 * be mass-assigned. Validators reject unknown fields; services enforce these lists.
 */
export const EDITABLE_FIELDS = {
  /** admin / hr (permission `employee:access-all`) editing any employee */
  all: [
    'firstName',
    'lastName',
    'workEmail',
    'phone',
    'departmentId',
    'managerId',
    'jobTitle',
    'joiningDate',
    'employmentStatus',
  ],
  /** a manager (permission `employee:access-team`) editing a direct report */
  team: ['jobTitle', 'employmentStatus'],
  /** anyone editing their own profile via /employees/me */
  self: ['firstName', 'lastName', 'phone'],
} as const satisfies Record<string, readonly EmployeeField[]>;

export const EMPLOYEE_SORT_FIELDS = ['lastName', 'firstName', 'joiningDate', 'createdAt'] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

export interface EmployeeListQuery {
  page: number;
  pageSize: number;
  departmentId?: string;
  employmentStatus?: EmploymentStatus;
  search?: string;
  sortBy: EmployeeSortField;
  sortOrder: 'asc' | 'desc';
}
