import { NextFunction, Request, Response } from "express";
import { MittwaldAPIV2Client } from "@mittwald/api-client";
import { ExtensionInstance } from "../aggregate/extensionInstance.js";
import { ExtensionInstanceMongoRepository } from "../repository/ExtensionInstanceMongoRepository.js";
import { verify } from "@mittwald/ext-bridge/node";
import { getAccessToken } from "@mittwald/ext-bridge/node";
import { logger, setLogContext } from "../logger.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        token: string;
        extensionInstance: ExtensionInstance;
        mittwaldClient: MittwaldAPIV2Client;
      };
    }
  }
}

export function createAuthMiddleware(
  extensionInstanceRepository: ExtensionInstanceMongoRepository,
  extensionSecret: string,
) {
  return async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const startTime = Date.now();

    // Set component context for this middleware
    setLogContext({ component: "authenticationMiddleware" });

    logger.info("Authentication request received");

    try {
      const sessionToken = req.header("Session-Token");
      if (!sessionToken) {
        logger.warn("Session token not provided");
        return res
          .status(401)
          .json({ message: "sessionToken not provided in headers" });
      }

      // verify and decode session token
      const decodedSessionToken = await verify(sessionToken);
      logger.debug({ decodedSessionToken }, "Session token verified");

      // get extensionInstance from repository
      const extensionInstance = await extensionInstanceRepository.require(
        decodedSessionToken.extensionInstanceId,
      );

      // Add extension instance context to async storage
      setLogContext({
        extensionInstanceId: extensionInstance.id,
        contextId: extensionInstance.contextId,
      });

      logger.debug("Extension instance retrieved");

      // get accesstoken from api
      const accessToken = await getAccessToken(sessionToken, extensionSecret);
      logger.debug("Access token obtained");

      // Create a new mittwaldClient instance using the retrieved public token
      const mittwaldClient = MittwaldAPIV2Client.newWithToken(
        accessToken.publicToken,
      );

      // temporarily disable automatic error throwing for non-2xx responses, because it seems as if there is an error downstream
      // todo: investigate if this is really necessary and if there is a better way to handle this
      mittwaldClient.axios.defaults.validateStatus = () => true;

      // Attach auth data to the request
      req.auth = {
        token: accessToken.publicToken,
        extensionInstance,
        mittwaldClient,
      };

      const responseTime = Date.now() - startTime;
      logger.info({ responseTime }, "Authentication successful");

      next();
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.logError(error, "Authentication failed");
      logger.error({ responseTime }, "Returning authentication error");
      res.status(500).json({ message: "error while authenticating" });
    }
  };
}
