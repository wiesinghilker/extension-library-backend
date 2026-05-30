import { TempSSHConnectionV2 } from "./TempSSHConnection.js";
import { dirname } from "path";
import {
  escapeShellArg,
  validatePath,
  validatePermissions,
} from "./securityUtils.js";
import { logger } from "../logger.js";

export class FileHandler {
  private readonly sshConnection: TempSSHConnectionV2;
  private readonly logger = logger.withContext({ component: "FileHandler" });

  constructor(sshConnection: TempSSHConnectionV2) {
    this.sshConnection = sshConnection;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const startTime = Date.now();
    this.logger.info(
      { filePath, contentLength: content.length },
      "Writing file",
    );

    try {
      validatePath(filePath);
      const directory = dirname(filePath);

      if (directory !== "/" && directory !== ".") {
        this.logger.debug({ directory }, "Creating parent directory");
        try {
          validatePath(directory);
          await this.sshConnection.executeCommandSafe(
            `mkdir -p ${escapeShellArg(directory)}`,
          );
          this.logger.debug({ directory }, "Parent directory created");
        } catch (error) {
          this.logger.logError(error, "Failed to create parent directory", {
            directory,
            filePath,
          });
          throw new Error(
            `Failed to create directory ${directory}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      }

      this.logger.debug({ filePath }, "Writing file content");
      try {
        await this.sshConnection.executeCommandSafe(
          `cat > ${escapeShellArg(filePath)}`,
          {
            stdin: content,
          },
        );
      } catch (error) {
        this.logger.logError(error, "Failed to write file content", {
          filePath,
        });
        throw new Error(
          `Failed to write file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      this.logger.debug({ filePath }, "Verifying file creation");
      try {
        const verifyResult = await this.sshConnection.executeCommandSafe(
          `test -f ${escapeShellArg(filePath)} && echo "exists" || echo "not found"`,
        );
        if (verifyResult.stdout.trim() !== "exists") {
          this.logger.error(
            { filePath, verifyOutput: verifyResult.stdout },
            "File verification failed",
          );
          throw new Error(
            `File verification failed: ${filePath} was not created`,
          );
        }
      } catch (error) {
        this.logger.logError(error, "Failed to verify file creation", {
          filePath,
        });
        throw new Error(
          `Failed to verify file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      const responseTime = Date.now() - startTime;
      this.logger.info(
        { filePath, contentLength: content.length, responseTime },
        "File written successfully",
      );
    } catch (error) {
      const responseTime = Date.now() - startTime;
      if (error instanceof Error && error.message.startsWith("Failed to")) {
        this.logger.error({ filePath, responseTime }, error.message);
        throw error;
      }
      this.logger.logError(error, "FileHandler error during writeFile", {
        filePath,
        responseTime,
      });
      throw new Error(
        `FileHandler error: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async appendFile(filePath: string, content: string): Promise<void> {
    try {
      validatePath(filePath);
      try {
        await this.sshConnection.executeCommandSafe(
          `cat >> ${escapeShellArg(filePath)}`,
          {
            stdin: content,
          },
        );
      } catch (error) {
        throw new Error(
          `Failed to append to file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Failed to")) {
        throw error;
      }
      throw new Error(
        `FileHandler error: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const startTime = Date.now();
    this.logger.info({ filePath }, "Deleting file");

    try {
      validatePath(filePath);
      try {
        await this.sshConnection.executeCommandSafe(
          `rm -f ${escapeShellArg(filePath)}`,
        );

        const responseTime = Date.now() - startTime;
        this.logger.info(
          { filePath, responseTime },
          "File deleted successfully",
        );
      } catch (error) {
        this.logger.logError(error, "Failed to delete file", { filePath });
        throw new Error(
          `Failed to delete file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      if (error instanceof Error && error.message.startsWith("Failed to")) {
        this.logger.error({ filePath, responseTime }, error.message);
        throw error;
      }
      this.logger.logError(error, "FileHandler error during deleteFile", {
        filePath,
        responseTime,
      });
      throw new Error(
        `FileHandler error: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    const startTime = Date.now();
    this.logger.debug({ filePath }, "Checking file existence");

    try {
      validatePath(filePath);
      const result = await this.sshConnection.executeCommandSafe(
        `test -f ${escapeShellArg(filePath)} && echo "true" || echo "false"`,
        { acceptedExitCodes: [0, 1] },
      );

      const exists = result.stdout.trim() === "true";
      const responseTime = Date.now() - startTime;

      this.logger.debug(
        { filePath, exists, responseTime },
        "File existence check completed",
      );

      return exists;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.logError(error, "FileHandler error during fileExists", {
        filePath,
        responseTime,
      });
      throw new Error(
        `FileHandler error checking file existence: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async readFile(filePath: string): Promise<string> {
    const startTime = Date.now();
    this.logger.info({ filePath }, "Reading file");

    try {
      validatePath(filePath);
      const result = await this.sshConnection.executeCommandSafe(
        `cat ${escapeShellArg(filePath)}`,
      );

      const responseTime = Date.now() - startTime;
      this.logger.info(
        { filePath, contentLength: result.stdout.length, responseTime },
        "File read successfully",
      );

      return result.stdout;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      if (error instanceof Error && error.message.startsWith("Failed to")) {
        this.logger.error({ filePath, responseTime }, error.message);
        throw error;
      }
      this.logger.logError(error, "FileHandler error during readFile", {
        filePath,
        responseTime,
      });
      throw new Error(
        `FileHandler error reading file: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    try {
      validatePath(dirPath);
      try {
        await this.sshConnection.executeCommandSafe(
          `mkdir -p ${escapeShellArg(dirPath)}`,
        );
      } catch (error) {
        throw new Error(
          `Failed to create directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Failed to")) {
        throw error;
      }
      throw new Error(
        `FileHandler error creating directory: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async listDirectory(dirPath: string): Promise<string[]> {
    try {
      validatePath(dirPath);
      const result = await this.sshConnection.executeCommandSafe(
        `ls -1a ${escapeShellArg(dirPath)}`,
      );

      return result.stdout
        .split("\n")
        .filter((line) => line.trim() && line !== "." && line !== "..")
        .map((line) => line.trim());
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Failed to")) {
        throw error;
      }
      throw new Error(
        `FileHandler error listing directory: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async touchFile(filePath: string): Promise<void> {
    try {
      validatePath(filePath);
      const directory = dirname(filePath);
      if (directory !== "/" && directory !== ".") {
        try {
          validatePath(directory);
          await this.sshConnection.executeCommandSafe(
            `mkdir -p ${escapeShellArg(directory)}`,
          );
        } catch (error) {
          throw new Error(
            `Failed to create directory ${directory}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      }

      try {
        await this.sshConnection.executeCommandSafe(
          `touch ${escapeShellArg(filePath)}`,
        );
      } catch (error) {
        throw new Error(
          `Failed to touch file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Failed to")) {
        throw error;
      }
      throw new Error(
        `FileHandler error touching file: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async changePermissions(
    filePath: string,
    permissions: string,
  ): Promise<void> {
    try {
      validatePath(filePath);
      validatePermissions(permissions);
      try {
        await this.sshConnection.executeCommandSafe(
          `chmod ${escapeShellArg(permissions)} ${escapeShellArg(filePath)}`,
        );
      } catch (error) {
        throw new Error(
          `Failed to change permissions for ${filePath} to ${permissions}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Failed to")) {
        throw error;
      }
      throw new Error(
        `FileHandler error changing permissions: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async lockFile(filePath: string): Promise<void> {
    try {
      await this.changePermissions(filePath, "a-w");
    } catch (error) {
      throw new Error(
        `Failed to lock file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async unlockFile(filePath: string): Promise<void> {
    try {
      await this.changePermissions(filePath, "u+w");
    } catch (error) {
      throw new Error(
        `Failed to unlock file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
}
