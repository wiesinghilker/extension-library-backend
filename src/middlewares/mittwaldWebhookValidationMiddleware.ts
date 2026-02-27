import express from "express";
import { z } from "zod";
import { logger } from "../logger.js";
import {
  ApiPublicKeyProvider,
  CachingPublicKeyProvider,
} from "../webhookVerification/publicKeyProvider.js";
import { verifyEd25519Signature } from "../webhookVerification/signatureVerifier.js";

const webhookMetaSchema = z.object({
  meta: z.object({
    extensionId: z.string(),
  }),
});

export interface WebhookValidationOptions {
  extensionId: string;
  apiBaseUrl?: string;
}

export function createWebhookValidationMiddleware(
  options: WebhookValidationOptions,
): express.RequestHandler {
  const publicKeyProvider = new CachingPublicKeyProvider(
    new ApiPublicKeyProvider(options.apiBaseUrl),
  );

  return async (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    const startTime = Date.now();
    const requestLogger = logger.withContext({
      component: "mittwaldWebhookValidationMiddleware",
    });

    requestLogger.info(
      {
        method: req.method,
        path: req.path,
        userAgent: req.get("user-agent"),
      },
      "Processing webhook validation",
    );

    try {
      requestLogger.debug({ headers: req.headers }, "Webhook request headers");

      const serial = req.header("X-Marketplace-Signature-Serial");
      const signature = req.header("X-Marketplace-Signature");
      const algorithm = req.header("X-Marketplace-Signature-Algorithm");

      requestLogger.debug(
        {
          hasSerial: !!serial,
          hasSignature: !!signature,
          algorithm,
        },
        "Signature validation details",
      );

      if (!serial || !signature || !algorithm) {
        requestLogger.warn(
          {
            hasSerial: !!serial,
            hasSignature: !!signature,
            hasAlgorithm: !!algorithm,
          },
          "Missing required signature headers",
        );
        throw new Error("missing signature details");
      }

      if (algorithm !== "Ed25519") {
        requestLogger.warn({ algorithm }, "Unexpected signature algorithm");
        throw new Error("unexpected signature algorithm");
      }

      if (!req.rawBody) {
        throw new Error(
          "rawBody not available on request — use jsonParserWithRawBody instead of express.json()",
        );
      }

      const publicKey = await publicKeyProvider.getPublicKey(serial);

      const valid = await verifyEd25519Signature(
        req.rawBody,
        signature,
        publicKey,
      );
      if (!valid) {
        requestLogger.warn("ED25519 signature verification failed");
        throw new Error("signature verification failed");
      }

      requestLogger.debug("ED25519 signature verified successfully");

      // Extension ID check
      const parsed = webhookMetaSchema.safeParse(req.body);
      if (parsed.success) {
        if (parsed.data.meta.extensionId !== options.extensionId) {
          requestLogger.warn(
            {
              expected: options.extensionId,
              received: parsed.data.meta.extensionId,
            },
            "Extension ID mismatch",
          );
          throw new Error("extension ID mismatch");
        }
      } else {
        requestLogger.warn(
          "Webhook body has no valid meta field — skipping extension ID check",
        );
      }

      const responseTime = Date.now() - startTime;
      requestLogger.info(
        { responseTime },
        "Webhook validation completed successfully",
      );

      next();
    } catch (error) {
      const responseTime = Date.now() - startTime;
      requestLogger.logError(error, "Webhook validation failed", {
        responseTime,
      });
      throw error;
    }
  };
}
