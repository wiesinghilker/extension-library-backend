import express from "express";
import { ExtensionInstanceRepository } from "../repository/ExtensionInstanceRepository.js";
import {
  addedSchema,
  removedSchema,
  secretRotatedSchema,
  updatedSchema,
} from "../lifecyclePayloadSchemas.js";
import { logger } from "../logger.js";

export const lifecycleRoutes = (
  extensionInstanceRepository: ExtensionInstanceRepository,
): express.Router => {
  const router = express.Router();
  const routerLogger = logger.withContext({ component: "lifecycleRouter" });

  router.post("/lifecycle/added", async (req, res) => {
    const startTime = Date.now();
    routerLogger.info("Processing lifecycle/added request");

    try {
      const validatedPayload = await addedSchema.safeParseAsync(req.body);
      if (!validatedPayload.success) {
        routerLogger.warn(
          { validationErrors: validatedPayload.error.issues },
          "Validation failed for lifecycle/added",
        );
        return res.status(400).json(validatedPayload.error.issues);
      }

      const extensionData = {
        id: validatedPayload.data.id,
        secret: validatedPayload.data.secret,
        enabled: validatedPayload.data.state.enabled,
        consentedScopes: validatedPayload.data.consentedScopes,
        contextId: validatedPayload.data.context.id,
        variantKey: validatedPayload.data.variantKey,
      };

      routerLogger.info(
        {
          extensionInstanceId: extensionData.id,
          contextId: extensionData.contextId,
          enabled: extensionData.enabled,
          scopesCount: extensionData.consentedScopes.length,
          variantKey: extensionData.variantKey,
        },
        "Adding extension instance",
      );

      await extensionInstanceRepository.add(extensionData);

      const responseTime = Date.now() - startTime;
      routerLogger.info(
        { extensionInstanceId: extensionData.id, responseTime },
        "Extension instance added successfully",
      );

      return res.status(204).send();
    } catch (error) {
      const responseTime = Date.now() - startTime;
      routerLogger.logError(error, "Failed to process lifecycle/added", {
        responseTime,
      });
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  router.post("/lifecycle/updated", async (req, res) => {
    const startTime = Date.now();

    routerLogger.info("Processing lifecycle/updated request");

    try {
      const validatedPayload = await updatedSchema.safeParseAsync(req.body);

      if (!validatedPayload.success) {
        routerLogger.warn(
          {
            validationErrors: validatedPayload.error.issues,
          },
          "Validation failed for lifecycle/updated",
        );
        return res.status(400).json(validatedPayload.error.issues);
      }

      const extensionInstanceId = validatedPayload.data.id;
      const updateData = {
        enabled: validatedPayload.data.state.enabled,
        consentedScopes: validatedPayload.data.consentedScopes,
        variantKey: validatedPayload.data.variantKey,
      };

      routerLogger.info(
        {
          extensionInstanceId,
          enabled: updateData.enabled,
          scopesCount: updateData.consentedScopes.length,
          variantKey: updateData.variantKey,
        },
        "Updating extension instance",
      );

      await extensionInstanceRepository.update(extensionInstanceId, updateData);

      const responseTime = Date.now() - startTime;
      routerLogger.info(
        { extensionInstanceId, responseTime },
        "Extension instance updated successfully",
      );

      return res.status(204).send();
    } catch (error) {
      const responseTime = Date.now() - startTime;
      routerLogger.logError(error, "Failed to process lifecycle/updated", {
        responseTime,
      });
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  router.post("/lifecycle/secret-rotated", async (req, res) => {
    const startTime = Date.now();
    routerLogger.info("Processing lifecycle/secret-rotated request");

    try {
      const validatedPayload = await secretRotatedSchema.safeParseAsync(
        req.body,
      );
      if (!validatedPayload.success) {
        routerLogger.warn(
          { validationErrors: validatedPayload.error.issues },
          "Validation failed for lifecycle/secret-rotated",
        );
        return res.status(400).json(validatedPayload.error.issues);
      }

      const extensionInstanceId = validatedPayload.data.id;
      routerLogger.info(
        { extensionInstanceId },
        "Rotating extension instance secret",
      );

      await extensionInstanceRepository.rotateSecret(
        extensionInstanceId,
        validatedPayload.data.secret,
      );

      const responseTime = Date.now() - startTime;
      routerLogger.info(
        { extensionInstanceId, responseTime },
        "Extension instance secret rotated successfully",
      );

      return res.status(204).send();
    } catch (error) {
      const responseTime = Date.now() - startTime;
      routerLogger.logError(
        error,
        "Failed to process lifecycle/secret-rotated",
        { responseTime },
      );
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  router.post("/lifecycle/removed", async (req, res) => {
    const startTime = Date.now();
    routerLogger.info("Processing lifecycle/removed request");

    try {
      const validatedPayload = await removedSchema.safeParseAsync(req.body);
      if (!validatedPayload.success) {
        routerLogger.warn(
          { validationErrors: validatedPayload.error.issues },
          "Validation failed for lifecycle/removed",
        );
        return res.status(400).json(validatedPayload.error.issues);
      }

      const extensionInstanceId = validatedPayload.data.id;
      routerLogger.info({ extensionInstanceId }, "Removing extension instance");

      await extensionInstanceRepository.remove(extensionInstanceId);

      const responseTime = Date.now() - startTime;
      routerLogger.info(
        { extensionInstanceId, responseTime },
        "Extension instance removed successfully",
      );

      return res.status(204).send();
    } catch (error) {
      const responseTime = Date.now() - startTime;
      routerLogger.logError(error, "Failed to process lifecycle/removed", {
        responseTime,
      });
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  return router;
};
