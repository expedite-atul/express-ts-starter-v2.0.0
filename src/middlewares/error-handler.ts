import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import {
  AppError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../errors/app-error.ts';

/**
 * The single place where errors become HTTP responses.
 *
 * - Expected errors (AppError) → their status, code and message.
 * - Body-parser errors (bad JSON, too large) → 400 / 413 / 415.
 * - Anything else is a bug → logged in full with the request id, answered with a generic
 *   500. Stack traces, SQL and internal messages never reach the client.
 *
 * Response shape: { "error": { "code", "message", "details"?, "requestId" } }
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  // Express recognises an error handler by its four parameters, so `_next` must stay.
  return (error: unknown, req, res, _next) => {
    const appError = toAppError(error);

    if (appError.status >= 500) {
      logger.error({ err: error, requestId: req.requestId }, 'unhandled error');
    }

    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(appError.status).json({
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
        requestId: req.requestId,
      },
    });
  };
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  // Errors thrown by express.json() carry a `type`.
  switch (bodyParserErrorType(error)) {
    case 'entity.parse.failed':
      return new ValidationError('The request body is not valid JSON');
    case 'entity.too.large':
      return new PayloadTooLargeError();
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return new UnsupportedMediaTypeError();
    default:
      return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

function bodyParserErrorType(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string') {
    return error.type;
  }
  return undefined;
}
