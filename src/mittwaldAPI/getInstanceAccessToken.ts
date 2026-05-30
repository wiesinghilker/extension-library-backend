import { MittwaldAPIV2Client } from "@mittwald/api-client";
import { logger } from "../logger.js";

const instanceTokenLogger = logger.withContext({
  component: "getInstanceAccessToken",
});

export interface InstanceAccessToken {
  publicToken: string;
  expiry: string;
}

/**
 * Authenticates an extension instance against the mStudio API using the
 * instance secret received via lifecycle webhooks. This allows the extension
 * to act on behalf of the instance in the background, without a user session.
 *
 * @param extensionInstanceId - The id of the extension instance.
 * @param extensionInstanceSecret - The latest secret received via the
 *   ExtensionAddedToContext / ExtensionInstanceSecretRotated lifecycle webhooks.
 * @returns The public access token and its expiry timestamp.
 */
export const getInstanceAccessToken = async (
  extensionInstanceId: string,
  extensionInstanceSecret: string,
): Promise<InstanceAccessToken> => {
  instanceTokenLogger.debug(
    { extensionInstanceId },
    "Requesting instance access token",
  );

  const client = MittwaldAPIV2Client.newUnauthenticated();
  const response = await client.marketplace.extensionAuthenticateInstance({
    extensionInstanceId,
    data: { extensionInstanceSecret },
  });

  if (response.status !== 201) {
    instanceTokenLogger.error(
      { extensionInstanceId, status: response.status },
      "Failed to authenticate extension instance",
    );
    throw new Error(
      `could not authenticate extension instance: ${String(response.status)}`,
    );
  }

  instanceTokenLogger.info(
    { extensionInstanceId, expiry: response.data.expiry },
    "Instance access token obtained",
  );

  return {
    publicToken: response.data.publicToken,
    expiry: response.data.expiry,
  };
};
