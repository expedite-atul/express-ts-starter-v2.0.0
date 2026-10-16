/**
 * Errors the application expects. Services and repositories throw these; the central
 * error handler (middlewares/error-handler.ts) is the only place that turns them into
 * HTTP responses. Anything that is NOT an AppError is treated as a bug: logged in full,
 * answered with a generic 500.
 *
 * Messages are shown to API clients, so they must never contain secrets, SQL or stack traces.
 */
export interface ErrorDetail {
  /** Which input field the problem is about, e.g. "workEmail" or "query.pageSize". */
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetail[] | undefined;

  constructor(status: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** 400: the request does not match the expected shape. */
export class ValidationError extends AppError {
  constructor(message = 'The request is invalid', details?: ErrorDetail[]) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

/** 401: no valid credentials. Deliberately vague about why. */
export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication is required', code = 'UNAUTHENTICATED') {
    super(401, code, message);
  }
}

/** 401 for login: the same message whether the email or the password was wrong. */
export class InvalidCredentialsError extends UnauthenticatedError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS');
  }
}

/** 403: authenticated, but not allowed to perform this action. */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', details?: ErrorDetail[]) {
    super(403, 'FORBIDDEN', message, details);
  }
}

/**
 * 404: does not exist, OR exists but the caller may not see it. Using the same answer for
 * both stops an attacker from discovering which IDs exist (object-level authorisation).
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

/** 409: conflicts with existing data, e.g. a duplicate work email. */
export class ConflictError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super(409, 'CONFLICT', message, details);
  }
}

/** 422: well-formed, but breaks a business rule (unknown department, manager cycle, ...). */
export class BusinessRuleError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super(422, 'BUSINESS_RULE_VIOLATION', message, details);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor() {
    super(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large');
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor() {
    super(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request bodies must be JSON (Content-Type: application/json)');
  }
}

export class TooManyRequestsError extends AppError {
  constructor() {
    super(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
  }
}
