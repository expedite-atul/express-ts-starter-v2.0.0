/**
 * Structured JSON logging with pino.
 *
 * Privacy rules for logs (assignment §5):
 * - never log passwords, access tokens, refresh tokens, cookies or password hashes;
 * - never log request bodies or complete employee records.
 * The request logger only records method, path, status and timing. `redact` is the safety
 * net for anything that slips through, and errors are reduced to type, message and stack
 * (a database error object would otherwise carry its SQL parameters into the log).
 */
import { pino, type DestinationStream, type Logger } from 'pino';

export const REDACTED_PATHS = [
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'token',
  'authorization',
  'cookie',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
  '*.authorization',
  '*.cookie',
  '*.headers.authorization',
  '*.headers.cookie',
];

export interface LoggerOptions {
  level: string;
  /** Where to write. Defaults to stdout; tests pass an in-memory stream. */
  destination?: DestinationStream;
}

export function createLogger({ level, destination }: LoggerOptions): Logger {
  return pino(
    {
      level,
      base: { service: 'employee-management-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      serializers: { err: serializeError },
    },
    destination,
  );
}

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: String(error) };
  return { type: error.name, message: error.message, stack: error.stack };
}
