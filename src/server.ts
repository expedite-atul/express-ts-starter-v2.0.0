/**
 * Process entry point: starts the HTTP server and stops it cleanly.
 *
 * Keep this file thin. It wires things together and owns the process lifecycle
 * (start, listen errors, shutdown signals); the application is built in app.ts.
 */

// Imported first, so invalid configuration stops the process before anything else loads.
import { env } from './config/env.ts';
import { createApp } from './app.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();

const server = app.listen(env.PORT, (error) => {
  if (error) {
    // For example EADDRINUSE: another process is already using the port.
    console.error(`Could not start the server on port ${env.PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

/**
 * Graceful shutdown: stop accepting new connections, let in-flight requests finish,
 * then exit. When the database module is added, close its connection pool here too.
 */
function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received: shutting down`);

  // If a request hangs, do not wait forever. unref() lets the process exit sooner.
  setTimeout(() => {
    console.error(`Shutdown took longer than ${SHUTDOWN_TIMEOUT_MS} ms: forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close((error) => {
    if (error) {
      console.error(`Error while closing the server: ${error.message}`);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
