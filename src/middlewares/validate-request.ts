import type { Request, RequestHandler } from 'express';
import type { z, ZodType } from 'zod';
import { ValidationError, type ErrorDetail } from '../errors/app-error.ts';

/** The schemas for one endpoint. Each is optional; parts without a schema are not read. */
export interface RequestSchemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

export type ValidatedInput<S extends RequestSchemas> = {
  [K in keyof S]: S[K] extends ZodType ? z.output<S[K]> : never;
};

/**
 * Validates params, query and body against zod schemas. On failure: 400 with one detail
 * per problem. On success the PARSED values (trimmed, defaults applied, unknown fields
 * rejected) are stored on `req.validated`; controllers read only those, never `req.body`.
 */
export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const details: ErrorDetail[] = [];
    const validated: Record<string, unknown> = {};

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
        continue;
      }
      for (const issue of result.error.issues) {
        if (issue.code === 'unrecognized_keys') {
          // Mass assignment attempt or typo: name each field that is not allowed.
          for (const key of issue.keys) {
            details.push({ path: [part, ...issue.path, key].join('.'), message: 'is not an allowed field' });
          }
        } else {
          details.push({ path: [part, ...issue.path].join('.'), message: issue.message });
        }
      }
    }

    if (details.length > 0) {
      next(new ValidationError('The request is invalid', details));
      return;
    }
    req.validated = validated;
    next();
  };
}

/**
 * Typed access to what `validateRequest` stored. Pass the same schemas object the route
 * used; it is only there so TypeScript can infer the types.
 */
export function getValidated<S extends RequestSchemas>(req: Request, _schemas: S): ValidatedInput<S> {
  if (!req.validated) throw new Error('validateRequest() did not run for this route');
  return req.validated as ValidatedInput<S>;
}
