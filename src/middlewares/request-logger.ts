import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

/**
 * One log line per request: method, path (without the query string, which can hold search
 * terms), status, duration and user id. Never headers or bodies, which carry tokens and
 * personal data.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const startedAt = performance.now();
    res.on('finish', () => {
      logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
          userId: req.actor?.userId,
        },
        'request completed',
      );
    });
    next();
  };
}
