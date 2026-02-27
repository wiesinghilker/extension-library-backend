import express from "express";
import { z } from "zod";
import { logger, setLogLevel, DEFAULT_LOG_LEVEL } from "../logger.js";

const validLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

const logLevelSchema = z.object({
  level: z.enum(validLevels),
  timeoutMinutes: z.number().positive().optional(),
});

export const adminRoutes = (): express.Router => {
  const router = express.Router();
  const routerLogger = logger.withContext({ component: "adminRouter" });

  // Track active timeout for log level reset
  let logLevelResetTimeout: NodeJS.Timeout | null = null;

  // Route to change log level
  router.post("/admin/log-level", (req, res) => {
    const startTime = Date.now();

    const parsed = logLevelSchema.safeParse(req.body);
    if (!parsed.success) {
      routerLogger.warn(
        { errors: parsed.error.issues },
        "Invalid request body",
      );
      return res.status(400).json({
        message: "Invalid request body",
        availableLevels: validLevels,
        errors: parsed.error.issues,
      });
    }

    const { level, timeoutMinutes } = parsed.data;

    routerLogger.info(
      { requestedLevel: level, timeoutMinutes },
      "Processing admin/log-level POST request",
    );

    try {
      const timeoutMs = timeoutMinutes
        ? timeoutMinutes * 60 * 1000
        : 60 * 60 * 1000; // Default: 1 hour

      // Clear any existing timeout
      if (logLevelResetTimeout) {
        clearTimeout(logLevelResetTimeout);
        routerLogger.info("Cleared existing log level reset timeout");
      }

      // Change log level on the base Pino logger instance
      const previousLevel = setLogLevel(level);

      // Set up automatic reset to default level
      logLevelResetTimeout = setTimeout(() => {
        setLogLevel(DEFAULT_LOG_LEVEL);
        routerLogger.info(
          {
            resetFromLevel: level,
            resetToLevel: DEFAULT_LOG_LEVEL,
            timeoutMs,
          },
          "Log level automatically reset to default value",
        );
        logLevelResetTimeout = null;
      }, timeoutMs);

      const responseTime = Date.now() - startTime;

      routerLogger.info(
        {
          previousLevel,
          newLevel: level,
          timeoutMs,
          responseTime,
        },
        "Log level changed successfully with automatic reset scheduled",
      );

      return res.status(200).json({
        message: "Log level changed successfully",
        previousLevel,
        newLevel: level,
        resetAfterMs: timeoutMs,
        resetAfterMinutes: timeoutMs / (60 * 1000),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      routerLogger.logError(
        error,
        "Failed to process admin/log-level POST request",
        { requestedLevel: level, responseTime },
      );
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  return router;
};
