/**
 * Builds the Express application: middleware, routes and error handling.
 *
 * It does not open a port. server.ts does that, so tests can import `createApp()`
 * and send requests to it in memory without starting a real server.
 */
import express, { type Express } from 'express';

export function createApp(): Express {
  const app = express();

  // Liveness check: lets a load balancer, or you, confirm the process is up.
  // Deliberately outside /api/v1: it is infrastructure, not part of the versioned API.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
