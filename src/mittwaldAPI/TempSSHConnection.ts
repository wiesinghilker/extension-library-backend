import { MittwaldAPIV2, MittwaldAPIV2Client } from "@mittwald/api-client";
import { NodeSSH, SSHExecCommandResponse } from "node-ssh";
import { sshHostname, sshPassword, sshUsernameForApp, sshUsernameForContainer } from "../generators.js";
import { logger } from "../logger.js";

export enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
  DISPOSED = "disposed",
}

export interface TempSSHConnectionOptionsBase {
  apiToken: string;
  project: MittwaldAPIV2.Components.Schemas.ProjectProject;
  extensionName: string;
  connectionTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  keepAliveInterval?: number;
  userExpirationHours?: number;
  onConnected?: (connection: TempSSHConnectionV2) => Promise<void> | void;
  onDisconnected?: (connection: TempSSHConnectionV2) => Promise<void> | void;
  onReconnected?: (connection: TempSSHConnectionV2) => Promise<void> | void;
}

export interface TempSSHConnectionOptionsWithApp
  extends TempSSHConnectionOptionsBase {
  appInstallationShortId: string;
  containerShortId?: never;
}

export interface TempSSHConnectionOptionsWithContainer
  extends TempSSHConnectionOptionsBase {
  containerShortId: string;
  appInstallation?: never;
}

export type TempSSHConnectionOptions =
  | TempSSHConnectionOptionsWithApp
  | TempSSHConnectionOptionsWithContainer;

export class SSHConnectionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = "SSHConnectionError";
  }
}

export class TempSSHConnectionV2 {
  private readonly apiClient: MittwaldAPIV2Client;
  private readonly appInstallationShortId?: string;
  private readonly containerShortId?: string;
  private readonly project: MittwaldAPIV2.Components.Schemas.ProjectProject;
  private readonly extensionName: string;
  private readonly logger = logger.withContext({
    component: "TempSSHConnectionV2",
  });

  private sshConnection?: NodeSSH;
  private sshUser?: MittwaldAPIV2.Components.Schemas.SshuserSshUser & {
    password: string;
  };
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private keepAliveTimer?: NodeJS.Timeout;

  private readonly connectionTimeout: number;
  private readonly retryAttempts: number;
  private readonly retryDelay: number;
  private readonly keepAliveInterval: number;
  private readonly userExpirationHours: number;
  private readonly onConnected?: (
    connection: TempSSHConnectionV2,
  ) => Promise<void> | void;
  private readonly onDisconnected?: (
    connection: TempSSHConnectionV2,
  ) => Promise<void> | void;
  private readonly onReconnected?: (
    connection: TempSSHConnectionV2,
  ) => Promise<void> | void;

  constructor(options: TempSSHConnectionOptions) {
    this.apiClient = MittwaldAPIV2Client.newWithToken(options.apiToken);
    this.appInstallationShortId = "appInstallationShortId" in options ? options.appInstallationShortId : undefined;
    this.containerShortId = "containerShortId" in options ? options.containerShortId : undefined;
    this.project = options.project;
    this.extensionName = options.extensionName;

    this.connectionTimeout = options.connectionTimeout ?? 30000;
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.keepAliveInterval = options.keepAliveInterval ?? 60000;
    this.userExpirationHours = options.userExpirationHours ?? 12;
    this.onConnected = options.onConnected;
    this.onDisconnected = options.onDisconnected;
    this.onReconnected = options.onReconnected;
  }

  get state(): ConnectionState {
    return this.connectionState;
  }

  async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTED) {
      return;
    }

    if (this.connectionState === ConnectionState.DISPOSED) {
      throw new SSHConnectionError("Connection has been disposed", "DISPOSED");
    }

    this.connectionState = ConnectionState.CONNECTING;

    try {
      if (!this.sshUser) {
        await this.createSSHUser();
      }

      await this.establishConnection();
      this.startKeepAlive();
      this.connectionState = ConnectionState.CONNECTED;

      // Execute onConnected callback
      if (this.onConnected) {
        try {
          await this.onConnected(this);
        } catch (error) {
          this.logger.logError(error, "Error in onConnected callback");
        }
      }
    } catch (error) {
      this.connectionState = ConnectionState.ERROR;
      throw error;
    }
  }

  private async establishConnection(): Promise<void> {
    if (!this.sshUser) {
      throw new SSHConnectionError("No SSH user created", "NO_USER");
    }

    const hostname = sshHostname(this.project);
    const username = this.getSSHUsername();

    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        this.sshConnection = new NodeSSH();
        await this.sshConnection.connect({
          host: hostname,
          username: username,
          password: this.sshUser.password,
          readyTimeout: this.connectionTimeout,
        });

        const testResult = await this.sshConnection.execCommand(
          "echo 'connection test'",
        );
        if (testResult.code !== 0) {
          throw new Error("Connection test failed");
        }

        return;
      } catch (error) {
        lastError = error;
        if (this.sshConnection) {
          this.sshConnection.dispose();
          this.sshConnection = undefined;
        }

        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    throw new SSHConnectionError(
      `Failed to connect after ${String(this.retryAttempts)} attempts`,
      "CONNECTION_FAILED",
      lastError,
    );
  }

  private async createSSHUser(): Promise<void> {
    if (this.sshUser) {
      return;
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.userExpirationHours);

    const password = sshPassword();
    const projectId = this.getProjectId();

    try {
      const response = await this.apiClient.sshsftpUser.sshUserCreateSshUser({
        projectId,
        data: {
          description: `Extension: ${this.extensionName}`,
          authentication: { password },
          expiresAt: expiresAt.toISOString(),
        },
      });

      if (response.status !== 201) {
        throw new SSHConnectionError(
          "Failed to create SSH user",
          "USER_CREATION_FAILED",
        );
      }

      this.sshUser = { ...response.data, password };
    } catch (error) {
      throw new SSHConnectionError(
        "SSH user creation failed",
        "USER_CREATION_ERROR",
        error,
      );
    }
  }

  async getSSHSession(): Promise<NodeSSH> {
    await this.ensureConnected();

    if (!this.sshConnection) {
      throw new SSHConnectionError(
        "SSH connection not available",
        "NO_CONNECTION",
      );
    }

    return this.sshConnection;
  }

  async executeCommand(
    command: string,
    options?: {
      stdin?: string;
      cwd?: string;
      env?: Record<string, string>;
      onStdout?: (chunk: Buffer) => void;
      onStderr?: (chunk: Buffer) => void;
    },
  ): Promise<SSHExecCommandResponse> {
    await this.ensureConnected();

    try {
      const conn = this.sshConnection;
      if (!conn) {
        throw new SSHConnectionError("SSH connection not available", "NO_CONNECTION");
      }
      return await conn.execCommand(command, options);
    } catch (error) {
      if (this.isConnectionError(error)) {
        await this.reconnect();
        const conn = this.sshConnection;
        if (!conn) {
          throw new SSHConnectionError("SSH connection not available after reconnect", "NO_CONNECTION");
        }
        return await conn.execCommand(command, options);
      }
      throw new SSHConnectionError(
        "Command execution failed",
        "EXEC_FAILED",
        error,
      );
    }
  }

  async executeCommandSafe(
    command: string,
    options?: {
      stdin?: string;
      cwd?: string;
      env?: Record<string, string>;
      acceptedExitCodes?: number[];
    },
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const result = await this.executeCommand(command, options);
    const exitCode = result.code ?? 0;
    const acceptedCodes = options?.acceptedExitCodes ?? [0];

    if (!acceptedCodes.includes(exitCode)) {
      const errorMessage =
        result.stderr || `Command failed with exit code ${String(exitCode)}`;
      throw new SSHConnectionError(
        `Command '${command}' failed (exit code ${String(exitCode)}): ${errorMessage}`,
        "COMMAND_FAILED",
      );
    }

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      code: exitCode,
    };
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      await this.connect();
    }
  }

  private async reconnect(): Promise<void> {
    this.disconnect();
    await this.connect();

    // Execute onReconnected callback
    if (this.onReconnected) {
      try {
        await this.onReconnected(this);
      } catch (error) {
        this.logger.logError(error, "Error in onReconnected callback");
      }
    }
  }

  isConnected(): boolean {
    return (
      this.connectionState === ConnectionState.CONNECTED &&
      this.sshConnection?.isConnected() === true
    );
  }

  disconnect(): void {
    const wasConnected = this.isConnected();

    this.stopKeepAlive();

    if (this.sshConnection) {
      this.sshConnection.dispose();
      this.sshConnection = undefined;
    }

    if (this.connectionState !== ConnectionState.DISPOSED) {
      this.connectionState = ConnectionState.DISCONNECTED;
    }

    // Execute onDisconnected callback if we were actually connected
    if (wasConnected && this.onDisconnected) {
      try {
        const result = this.onDisconnected(this);
        if (result instanceof Promise) {
          result.catch((error: unknown) => {
            this.logger.logError(error, "Error in onDisconnected callback");
          });
        }
      } catch (error) {
        this.logger.logError(error, "Error in onDisconnected callback");
      }
    }
  }

  async dispose(): Promise<void> {
    this.stopKeepAlive();

    try {
      if (this.sshConnection) {
        this.sshConnection.dispose();
        this.sshConnection = undefined;
      }

      if (this.sshUser) {
        await this.deleteUser();
      }
    } finally {
      this.connectionState = ConnectionState.DISPOSED;
    }
  }

  private async deleteUser(): Promise<void> {
    if (!this.sshUser) {
      return;
    }

    try {
      const response = await this.apiClient.sshsftpUser.sshUserDeleteSshUser({
        sshUserId: this.sshUser.id,
      });

      if (response.status !== 204) {
        this.logger.error(
          { status: response.status },
          "Failed to delete SSH user",
        );
      }
    } catch (error) {
      this.logger.logError(error, "Error deleting SSH user");
    } finally {
      this.sshUser = undefined;
    }
  }

  private startKeepAlive(): void {
    if (this.keepAliveInterval <= 0) {
      return;
    }

    this.keepAliveTimer = setInterval(() => {
      if (this.isConnected() && this.sshConnection) {
        this.sshConnection.execCommand("echo keepalive").catch(() => {
          void this.reconnect();
        });
      }
    }, this.keepAliveInterval);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }

  private isConnectionError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("timeout") ||
        message.includes("econnreset") ||
        message.includes("epipe") ||
        message.includes("enotfound")
      );
    }
    return false;
  }

  private getProjectId(): string {
    return this.project.id;
  }

  private getSSHUsername(): string {
    if (!this.sshUser) {
      throw new SSHConnectionError("No SSH user available", "NO_USER");
    }

    if (this.appInstallationShortId) {
      return sshUsernameForApp(this.appInstallationShortId, this.sshUser);
    } else if (this.containerShortId) {
      return sshUsernameForContainer(this.containerShortId, this.sshUser);
    } else {
      throw new SSHConnectionError(
        "Neither app installation nor container short ID provided",
        "INVALID_CONNECTION_TYPE",
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
