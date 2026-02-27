import { httpLogger } from "../logger.js";

/**
 * Express middleware that adds HTTP request/response logging using pino-http.
 *
 * This middleware will automatically:
 * - Log all HTTP requests and responses
 * - Set up async context for logger.withContext() usage in routes
 * - Include extension instance context after authentication
 * - Provide structured logging with request details
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { requestLoggingMiddleware, logger } from '@hueskehilker/extension-lib-backend';
 *
 * const app = express();
 * app.use(requestLoggingMiddleware);
 *
 * app.get('/api/users', (req, res) => {
 *   // Add additional context to logs within this request
 *   const contextLogger = logger.withContext({ operation: 'fetchUsers' });
 *   contextLogger.info('Fetching users from database');
 *
 *   // Or use the global logger - it automatically includes request context
 *   logger.debug('Processing user request');
 *
 *   res.json({ users: [] });
 * });
 * ```
 */
export const requestLoggingMiddleware = httpLogger;
