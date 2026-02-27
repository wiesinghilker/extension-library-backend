import { logger } from "./logger.js";

export const mStudioAPIHealthCheck = async (): Promise<boolean> => {
  const startTime = Date.now();
  const healthLogger = logger.withContext({
    component: "mStudioAPIHealthCheck",
  });

  healthLogger.debug("Starting mStudio API health check");

  try {
    const response = await fetch(
      "https://api.mittwald.de/v2/webhook-public-keys/latest",
      { signal: AbortSignal.timeout(2000) },
    );

    const responseTime = Date.now() - startTime;
    const isHealthy = response.ok;

    if (isHealthy) {
      healthLogger.debug(
        { responseTime, status: response.status },
        "mStudio API health check successful",
      );
    } else {
      healthLogger.warn(
        {
          responseTime,
          status: response.status,
          statusText: response.statusText,
        },
        "mStudio API health check failed - API returned non-OK status",
      );
    }

    return isHealthy;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    healthLogger.logError(
      error,
      "mStudio API health check failed with exception",
      { responseTime },
    );
    return false;
  }
};
