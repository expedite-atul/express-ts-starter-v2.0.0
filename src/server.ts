/**
 * Process entry point: connects to the database, starts the HTTP server, and stops both
 * cleanly. Keep this file thin: it wires things together and owns the process lifecycle.
 */

// Imported first, so invalid configuration stops the process before anything else loads.
import { env } from './config/env.ts';
import { createApp } from './app.ts';
import { createDataSource } from './config/database.ts';
import { createLogger } from './config/logger.ts';
import { createServices } from './container.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const logger = createLogger({ level: env.LOG_LEVEL });
const dataSource = createDataSource(env);

// Fail fast and safely: a clear message, no connection string (it contains a password).
try {
  await dataSource.initialize();
} catch (error) {
  logger.fatal(
    { reason: describe(error) },
    'Could not connect to the database. Check DATABASE_URL and that PostgreSQL is running.',
  );
  process.exit(1);
}
if (await dataSource.showMigrations()) {
  logger.fatal('The database schema is out of date. Run: npm run db:migrate');
  await dataSource.destroy();
  process.exit(1);
}

const app = createApp({ config: env, logger, services: createServices(dataSource, env) });

const server = app.listen(env.PORT, (error) => {
  if (error) {
    // For example EADDRINUSE: another process is already using the port.
    logger.fatal({ reason: error.message }, `Could not start the server on port ${env.PORT}`);
    process.exit(1);
  }
  logger.info(`Server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

/**
 * Graceful shutdown: stop accepting connections, let in-flight requests finish, close the
 * database pool, then exit.
 */
function shutdown(signal: NodeJS.Signals): void {
  logger.info(`${signal} received: shutting down`);

  // If a request hangs, do not wait forever. unref() lets the process exit sooner.
  setTimeout(() => {
    logger.error(`Shutdown took longer than ${SHUTDOWN_TIMEOUT_MS} ms: forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close((error) => {
    if (error) logger.error({ reason: error.message }, 'Error while closing the server');
    dataSource
      .destroy()
      .then(() => process.exit(error ? 1 : 0))
      .catch((closeError: unknown) => {
        logger.error({ reason: describe(closeError) }, 'Error while closing the database pool');
        process.exit(1);
      });
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

/** A short reason for a startup error. Connection-refused errors are AggregateErrors with an empty message. */
function describe(error: unknown): string {
  if (error instanceof AggregateError) return error.errors.map(describe).join('; ');
  return error instanceof Error ? error.message : String(error);
}
