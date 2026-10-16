/**
 * Turns PostgreSQL constraint violations into API errors.
 *
 * The database is the final authority on uniqueness and references: two requests that
 * pass the application's checks at the same moment can still collide, and only the
 * constraint catches that. Constraint names are set in src/entities, so they are stable.
 */
import { QueryFailedError } from 'typeorm';
import { BusinessRuleError, ConflictError } from '../errors/app-error.ts';

// PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

const UNIQUE_MESSAGES: Record<string, { path: string; message: string }> = {
  uq_employees_work_email: { path: 'workEmail', message: 'An employee with this work email already exists' },
  uq_users_email: { path: 'workEmail', message: 'A login account with this email already exists' },
  uq_users_employee_id: { path: 'employeeId', message: 'This employee already has a login account' },
  uq_departments_name: { path: 'name', message: 'A department with this name already exists' },
};

const REFERENCE_MESSAGES: Record<string, { path: string; message: string }> = {
  fk_employees_department: { path: 'departmentId', message: 'The department does not exist' },
  fk_employees_manager: { path: 'managerId', message: 'The manager does not exist' },
};

const CHECK_MESSAGES: Record<string, { path: string; message: string }> = {
  chk_employees_not_own_manager: { path: 'managerId', message: 'An employee cannot manage themselves' },
};

interface PostgresError {
  code?: string;
  constraint?: string;
}

/** Returns an AppError for known constraint violations; returns other errors unchanged. */
export function translateDatabaseError(error: unknown): unknown {
  if (!(error instanceof QueryFailedError)) return error;

  const { code, constraint = '' } = error.driverError as PostgresError;

  if (code === UNIQUE_VIOLATION) {
    const known = UNIQUE_MESSAGES[constraint];
    return new ConflictError(known?.message ?? 'The record conflicts with an existing one', known && [known]);
  }
  if (code === FOREIGN_KEY_VIOLATION) {
    const known = REFERENCE_MESSAGES[constraint];
    return new BusinessRuleError(known?.message ?? 'A referenced record does not exist', known && [known]);
  }
  if (code === CHECK_VIOLATION) {
    const known = CHECK_MESSAGES[constraint];
    return new BusinessRuleError(known?.message ?? 'The data breaks a database rule', known && [known]);
  }
  return error;
}
