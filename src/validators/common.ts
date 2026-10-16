/**
 * Reusable input rules. Every request schema is built from these, and every object schema
 * is STRICT (`z.strictObject`): a field that is not listed is rejected, which is what
 * stops mass assignment (`"role": "admin"`, `"salary": ...`).
 */
import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../domain/pagination.ts';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../domain/user.ts';

export const uuid = () => z.uuid({ error: 'must be a valid UUID' });

export const idParams = z.strictObject({ id: uuid() });

/** Trimmed and lower-cased, so "Ann@Example.com " and "ann@example.com" are the same account. */
export const email = () =>
  z.string().trim().toLowerCase().max(254).pipe(z.email({ error: 'must be a valid email address' }));

export const personName = () =>
  z.string().trim().min(1, { error: 'is required' }).max(100, { error: 'must be at most 100 characters' });

export const phone = () =>
  z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ()-]{5,30}$/, { error: 'must be a phone number such as +1-555-0100' });

export const isoDate = () => z.iso.date({ error: 'must be a date in YYYY-MM-DD format' });

/** Policy for NEW passwords. Login accepts any length, so old passwords keep working. */
export const newPassword = () =>
  z
    .string()
    .min(PASSWORD_MIN_LENGTH, { error: `must be at least ${PASSWORD_MIN_LENGTH} characters` })
    .max(PASSWORD_MAX_LENGTH, { error: `must be at most ${PASSWORD_MAX_LENGTH} characters` });

/** Pagination with a hard cap: asking for more than MAX_PAGE_SIZE is a 400, not silently capped. */
export const pageQuery = {
  page: z.coerce.number({ error: 'must be a number' }).int().min(1).default(1),
  pageSize: z.coerce
    .number({ error: 'must be a number' })
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE, { error: `must be at most ${MAX_PAGE_SIZE}` })
    .default(DEFAULT_PAGE_SIZE),
};

/** For PATCH bodies: at least one field must be present. */
export function nonEmpty<T extends object>(value: T): boolean {
  return Object.keys(value).length > 0;
}
export const NON_EMPTY_ERROR = { error: 'must contain at least one field to change' };
