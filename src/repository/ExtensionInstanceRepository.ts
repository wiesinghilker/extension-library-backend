import { ExtensionInstance } from "../aggregate/extensionInstance.js";

export interface ExtensionInstanceRepository {
  add(
    extensionInstance: Omit<ExtensionInstance, "addedAt" | "updatedAt">,
  ): Promise<void>;
  remove(extensionInstanceId: string): Promise<void>;
  rotateSecret(extensionInstanceId: string, secret: string): Promise<void>;
  update(
    extensionInstanceId: string,
    update: Omit<
      ExtensionInstance,
      "addedAt" | "contextId" | "id" | "secret" | "updatedAt"
    >,
  ): Promise<void>;
  get(extensionInstanceId: string): Promise<ExtensionInstance | null>;
  require(extensionInstance: string): Promise<ExtensionInstance>;
}
