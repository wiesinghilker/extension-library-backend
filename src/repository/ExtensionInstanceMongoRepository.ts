import { Collection } from "mongodb";
import { ExtensionInstanceRepository } from "./ExtensionInstanceRepository.js";
import { ExtensionInstance } from "../aggregate/extensionInstance.js";
import { logger } from "../logger.js";

export class ExtensionInstanceMongoRepository
  implements ExtensionInstanceRepository
{
  protected collection: Collection<ExtensionInstance>;
  private readonly logger = logger.withContext({
    component: "ExtensionInstanceMongoRepository",
  });

  constructor(extensionInstanceCollection: Collection<ExtensionInstance>) {
    this.collection = extensionInstanceCollection;
  }

  async initCollection(): Promise<void> {
    this.logger.info("Initializing collection indexes");
    try {
      await Promise.all([
        this.collection.createIndex({ id: 1 }, { unique: true }),
        this.collection.createIndex({ contextId: 1 }, { unique: true }),
      ]);
      this.logger.info("Collection indexes created successfully");
    } catch (error) {
      this.logger.logError(error, "Failed to create collection indexes");
      throw error;
    }
  }

  async add(
    extensionInstance: Omit<ExtensionInstance, "addedAt" | "updatedAt">,
  ): Promise<void> {
    this.logger.info(
      {
        extensionInstanceId: extensionInstance.id,
        contextId: extensionInstance.contextId,
      },
      "Adding extension instance",
    );
    try {
      const result = await this.collection.updateOne(
        { id: extensionInstance.id },
        {
          $set: {
            id: extensionInstance.id,
            contextId: extensionInstance.contextId,
            secret: extensionInstance.secret,
            consentedScopes: extensionInstance.consentedScopes,
            enabled: extensionInstance.enabled,
            addedAt: new Date(),
            variantKey: extensionInstance.variantKey,
          },
        },
        { upsert: true },
      );
      this.logger.info(
        {
          extensionInstanceId: extensionInstance.id,
          upserted: result.upsertedCount > 0,
          modified: result.modifiedCount > 0,
        },
        "Extension instance added successfully",
      );
    } catch (error) {
      this.logger.logError(error, "Failed to add extension instance", {
        extensionInstanceId: extensionInstance.id,
      });
      throw error;
    }
  }

  async remove(extensionInstanceId: string): Promise<void> {
    this.logger.info({ extensionInstanceId }, "Removing extension instance");
    try {
      const result = await this.collection.deleteOne({
        id: extensionInstanceId,
      });
      if (result.deletedCount === 0) {
        this.logger.warn(
          { extensionInstanceId },
          "Extension instance not found for removal",
        );
      } else {
        this.logger.info(
          { extensionInstanceId },
          "Extension instance removed successfully",
        );
      }
    } catch (error) {
      this.logger.logError(error, "Failed to remove extension instance", {
        extensionInstanceId,
      });
      throw error;
    }
  }

  async rotateSecret(
    extensionInstanceId: string,
    secret: string,
  ): Promise<void> {
    this.logger.info(
      { extensionInstanceId },
      "Rotating extension instance secret",
    );
    try {
      const result = await this.collection.updateOne(
        { id: extensionInstanceId },
        { $set: { secret, updatedAt: new Date() } },
      );
      if (result.matchedCount === 0) {
        this.logger.warn(
          { extensionInstanceId },
          "Extension instance not found for secret rotation",
        );
      } else {
        this.logger.info(
          { extensionInstanceId },
          "Extension instance secret rotated successfully",
        );
      }
    } catch (error) {
      this.logger.logError(
        error,
        "Failed to rotate extension instance secret",
        { extensionInstanceId },
      );
      throw error;
    }
  }

  async update(
    extensionInstanceId: string,
    update: Omit<
      ExtensionInstance,
      "addedAt" | "contextId" | "id" | "secret" | "updatedAt"
    >,
  ): Promise<void> {
    this.logger.info(
      {
        extensionInstanceId,
        enabled: update.enabled,
        scopesCount: update.consentedScopes.length,
      },
      "Updating extension instance",
    );
    try {
      const result = await this.collection.updateOne(
        { id: extensionInstanceId },
        {
          $set: {
            enabled: update.enabled,
            consentedScopes: update.consentedScopes,
            updatedAt: new Date(),
            variantKey: update.variantKey,
          },
        },
      );
      if (result.matchedCount === 0) {
        this.logger.warn(
          { extensionInstanceId },
          "Extension instance not found for update",
        );
      } else {
        this.logger.info(
          { extensionInstanceId },
          "Extension instance updated successfully",
        );
      }
    } catch (error) {
      this.logger.logError(error, "Failed to update extension instance", {
        extensionInstanceId,
      });
      throw error;
    }
  }

  async get(extensionInstanceId: string): Promise<ExtensionInstance | null> {
    this.logger.debug({ extensionInstanceId }, "Retrieving extension instance");
    try {
      const result = await this.collection.findOne({ id: extensionInstanceId });
      if (result) {
        this.logger.debug({ extensionInstanceId }, "Extension instance found");
      } else {
        this.logger.debug(
          { extensionInstanceId },
          "Extension instance not found",
        );
      }
      return result;
    } catch (error) {
      this.logger.logError(error, "Failed to retrieve extension instance", {
        extensionInstanceId,
      });
      throw error;
    }
  }

  async require(extensionInstanceId: string): Promise<ExtensionInstance> {
    this.logger.debug({ extensionInstanceId }, "Requiring extension instance");
    try {
      const extensionInstance = await this.collection.findOne({
        id: extensionInstanceId,
      });

      if (!extensionInstance) {
        this.logger.warn(
          { extensionInstanceId },
          "Required extension instance not found",
        );
        throw new Error("extension instance not found");
      }

      this.logger.debug(
        { extensionInstanceId },
        "Required extension instance found",
      );
      return extensionInstance;
    } catch (error) {
      this.logger.logError(error, "Failed to require extension instance", {
        extensionInstanceId,
      });
      throw error;
    }
  }

  async count(): Promise<number> {
    this.logger.debug("Counting extension instances");
    try {
      const count = await this.collection.countDocuments();
      this.logger.debug({ count }, "Extension instances counted");
      return count;
    } catch (error) {
      this.logger.logError(error, "Failed to count extension instances");
      throw error;
    }
  }
}
