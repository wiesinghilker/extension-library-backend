import express from "express";
import { logger } from "../logger.js";

export const commonRoutes = (): express.Router => {
  const router = express.Router();
  const routerLogger = logger.withContext({ component: "commonRouter" });

  router.get(`/common/employee`, async (req, res) => {
    const startTime = Date.now();

    if (!req.auth) {
      routerLogger.warn("Unauthenticated request to common/employee");
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { extensionInstance, mittwaldClient: mw } = req.auth;
    const extensionInstanceId = extensionInstance.id;

    routerLogger.info(
      { extensionInstanceId },
      "Processing common/employee request",
    );

    try {
      routerLogger.debug(
        { extensionInstanceId },
        "Retrieving user email from mittwald API",
      );

      const email = await mw.user.getOwnEmail();
      if (email.status !== 200) {
        routerLogger.error(
          { extensionInstanceId, status: email.status },
          "Failed to retrieve user email from mittwald API",
        );
        return res.status(500).json({
          message: "Could not retrieve user email",
        });
      }

      const userEmail = email.data.email;
      const isEmployee = userEmail.endsWith("@mittwald.de");

      const responseTime = Date.now() - startTime;
      routerLogger.info(
        {
          extensionInstanceId,
          userEmail: userEmail.split("@")[0] + "@***", // Log masked email
          isEmployee,
          responseTime,
        },
        "Employee check completed successfully",
      );

      return res.status(200).json({
        isEmployee,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      routerLogger.logError(
        error,
        "Failed to process common/employee request",
        { extensionInstanceId, responseTime },
      );
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  return router;
};
