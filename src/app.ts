/**
 * Builds the Express application: middleware, routes and error handling, in that order.
 *
 * It does not open a port or connect to the database: it receives its dependencies
 * (configuration, logger, services) as arguments. server.ts passes the real ones; tests
 * pass their own and send requests in memory.
 */
import cookieParser from 'cookie-parser';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Env } from './config/env.ts';
import type { Services } from './container.ts';
import { createAuthController } from './controllers/auth.controller.ts';
import { createDepartmentController } from './controllers/department.controller.ts';
import { createEmployeeController } from './controllers/employee.controller.ts';
import { createUserController } from './controllers/user.controller.ts';
import { createAuthenticate } from './middlewares/authenticate.ts';
import { createCors } from './middlewares/cors.ts';
import { createErrorHandler } from './middlewares/error-handler.ts';
import { notFound } from './middlewares/not-found.ts';
import { createRateLimiters } from './middlewares/rate-limit.ts';
import { requestId } from './middlewares/request-id.ts';
import { requestLogger } from './middlewares/request-logger.ts';
import { requireJsonBody } from './middlewares/require-json.ts';
import { createAuthRouter } from './routes/auth.routes.ts';
import { createDepartmentRouter } from './routes/department.routes.ts';
import { createEmployeeRouter } from './routes/employee.routes.ts';
import { createUserRouter } from './routes/user.routes.ts';

export interface AppDependencies {
  config: Env;
  logger: Logger;
  services: Services;
}

/** Largest JSON body accepted. Bigger requests get 413 before any code reads them. */
const BODY_LIMIT = '100kb';

export function createApp({ config, logger, services }: AppDependencies): Express {
  const app = express();

  // Real client IP behind N proxies (for rate limiting); 0 = trust no X-Forwarded-For header.
  app.set('trust proxy', config.TRUST_PROXY_HOPS);

  // 1. Cross-cutting, for every request
  app.use(requestId());
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(createCors(config.CORS_ORIGINS));

  // Liveness check: before rate limiting and authentication, outside the versioned API.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // 2. Abuse protection and input parsing
  const limiters = createRateLimiters(config);
  app.use(limiters.general);
  app.use(requireJsonBody());
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(cookieParser());

  // 3. The versioned API. Responses contain personal data: never cache them.
  const authenticate = createAuthenticate(services.auth);
  const api = Router();
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(
    '/auth',
    createAuthRouter(
      createAuthController(services.auth, { secureCookies: config.NODE_ENV === 'production' }),
      authenticate,
      limiters,
    ),
  );
  api.use(
    '/employees',
    createEmployeeRouter(createEmployeeController(services.employees, services.privacy), authenticate, limiters),
  );
  api.use('/departments', createDepartmentRouter(createDepartmentController(services.departments), authenticate));
  api.use('/users', createUserRouter(createUserController(services.users), authenticate));
  app.use('/api/v1', api);

  // 4. Nothing matched → 404; any error → one consistent JSON response.
  app.use(notFound());
  app.use(createErrorHandler(logger));

  return app;
}
