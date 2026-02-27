import pino from "pino";
import pinoHttp from "pino-http";
import pinoPretty from "pino-pretty";
import { AsyncLocalStorage } from "async_hooks";
import { Request } from "express";

export interface LogContext {
  extensionInstanceId?: string;
  contextId?: string;
  userId?: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  responseTime?: number;
  userAgent?: string;
  ip?: string;
  component?: string;
  [key: string]: unknown;
}

// AsyncLocalStorage to store request context
const asyncContext = new AsyncLocalStorage<LogContext>();

/**
 * Sets the log context for the current async execution context.
 * This allows you to add additional context information that will be included in all logs
 * generated within the current request/async operation.
 */
export const setLogContext = (context: LogContext): void => {
  const currentContext = asyncContext.getStore() ?? {};
  asyncContext.enterWith({ ...currentContext, ...context });
};

// Store the default log level from environment or use 'info' as fallback
export const DEFAULT_LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

const pinoOptions: pino.LoggerOptions = {
  level: DEFAULT_LOG_LEVEL,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
    log: (obj) => {
      const context = asyncContext.getStore();
      return context ? { ...context, ...obj } : obj;
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
};

const prettyStream = pinoPretty({
  colorize: false,
  translateTime: "HH:MM:ss Z",
  ignore: "pid,hostname",
});

const baseLogger = pino(pinoOptions, prettyStream);

// Keep track of all logger instances for level synchronization
const allLoggers: pino.Logger[] = [baseLogger];

// Extended logger with context support
export interface ExtendedLogger extends pino.Logger {
  withContext(context: LogContext): ExtendedLogger;
  logError(
    error: unknown,
    message?: string,
    context?: Record<string, unknown>,
  ): void;
}

// Simple wrapper that adds context methods to pino logger
const createExtendedLogger = (
  logger: pino.Logger,
  staticContext: LogContext = {},
): ExtendedLogger => {
  const extendedLogger = logger as ExtendedLogger;

  extendedLogger.withContext = (context: LogContext): ExtendedLogger => {
    const childLogger = logger.child(staticContext);
    allLoggers.push(childLogger);
    return createExtendedLogger(childLogger, {
      ...staticContext,
      ...context,
    });
  };

  extendedLogger.logError = (
    error: unknown,
    message?: string,
    context?: Record<string, unknown>,
  ): void => {
    const logContext = { ...staticContext, ...context };

    if (error instanceof Error) {
      logger.error(
        {
          ...logContext,
          error: {
            message: error.message,
            name: error.name,
            stack: error.stack,
          },
        },
        message ?? "An error occurred",
      );
    } else {
      logger.error({ ...logContext, error }, message ?? "An error occurred");
    }
  };

  return extendedLogger;
};

// Default logger instance
export const logger = createExtendedLogger(baseLogger);

// Function to change log level on all logger instances
export const setLogLevel = (level: string): string => {
  const previousLevel = baseLogger.level;
  // Set level on all logger instances
  allLoggers.forEach((logger) => {
    logger.level = level;
  });
  return previousLevel;
};

// Create pino-http middleware with async context integration
export const httpLogger = pinoHttp({
  logger: baseLogger,
  autoLogging: {
    ignore: (req) => {
      const userAgent = req.headers["user-agent"] ?? "";
      const skipPatterns = [/Uptime-Kuma/i, /Gatus/i, /HomeAssistant/i, /curl/i];
      return skipPatterns.some((pattern) => pattern.test(userAgent));
    },
  },
  customProps: (req) => {
    const customReq = req as Request;
    const context: LogContext = {};

    if (customReq.auth) {
      context.extensionInstanceId = customReq.auth.extensionInstance.id;
      context.contextId = customReq.auth.extensionInstance.contextId;
    }

    // Set async context for the request
    setLogContext({
      requestId: customReq.headers["x-request-id"] as string,
      method: customReq.method,
      path: customReq.path,
      userAgent: customReq.headers["user-agent"],
      // pino-http serializer may pass an object without socket at runtime
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      ip: customReq.ip ?? customReq.socket?.remoteAddress,
      ...context,
    });

    return context;
  },
  customSuccessMessage: (req) => {
    const customReq = req as Request;
    return `${customReq.method} ${customReq.path}`;
  },
  customErrorMessage: (req) => {
    const customReq = req as Request;
    return `${customReq.method} ${customReq.path} failed`;
  },
  customAttributeKeys: {
    req: "request",
    res: "response",
    err: "error",
    responseTime: "responseTime",
  },
  serializers: {
    req: (req) => {
      const customReq = req as Request;
      return {
        method: customReq.method,
        url: customReq.url,
        path: customReq.path,
        headers: {
          "user-agent": customReq.headers["user-agent"],
          "x-request-id": customReq.headers["x-request-id"],
        },
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        remoteAddress: customReq.ip ?? customReq.socket?.remoteAddress,
      };
    },
  },
});
