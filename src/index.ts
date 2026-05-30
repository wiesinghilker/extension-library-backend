import {
  appFullInstallationPath,
  pathToUserIni,
  sshHostname,
  sshPassword,
  sshUsername,
} from "./generators.js";
import {
  addedSchema,
  removedSchema,
  secretRotatedSchema,
  updatedSchema,
} from "./lifecyclePayloadSchemas.js";

export { createWebhookValidationMiddleware } from "./middlewares/mittwaldWebhookValidationMiddleware.js";
export type { WebhookValidationOptions } from "./middlewares/mittwaldWebhookValidationMiddleware.js";
export { jsonParserWithRawBody } from "./webhookVerification/jsonParserWithRawBody.js";
export { createAuthMiddleware } from "./middlewares/authenticationMiddleware.js";
export { requestLoggingMiddleware } from "./middlewares/requestLoggingMiddleware.js";
export { logger, type ExtendedLogger, type LogContext } from "./logger.js";

export { ExtensionInstanceMongoRepository } from "./repository/ExtensionInstanceMongoRepository.js";
export { ExtensionInstanceRepository } from "./repository/ExtensionInstanceRepository.js";
export { ExtensionInstance } from "./aggregate/extensionInstance.js";

export { TempSSHConnectionV2 } from "./mittwaldAPI/TempSSHConnection.js";
export { FileHandler } from "./mittwaldAPI/FileHandler";
export {
  getInstanceAccessToken,
  type InstanceAccessToken,
} from "./mittwaldAPI/getInstanceAccessToken.js";

export { mStudioAPIHealthCheck } from "./mStudioAPIHealthCheck.js";

export { lifecycleRoutes } from "./routers/lifecycleRouter.js";
export { commonRoutes } from "./routers/commonRouter.js";
export { adminRoutes } from "./routers/adminRouter.js";

export const lifecyclePayloadSchemas = {
  added: addedSchema,
  updated: updatedSchema,
  removed: removedSchema,
  secretRotated: secretRotatedSchema,
};
export const stringGenerators = {
  appFullInstallationPath,
  pathToUserIni,
  sshPassword,
  sshHostname,
  sshUsername,
};
