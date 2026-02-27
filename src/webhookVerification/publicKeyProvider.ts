import { MittwaldAPIV2Client } from "@mittwald/api-client";

export interface PublicKeyProvider {
  getPublicKey(serial: string): Promise<string>;
}

export class ApiPublicKeyProvider implements PublicKeyProvider {
  private readonly apiClient: MittwaldAPIV2Client;

  public constructor(apiBaseUrl?: string) {
    this.apiClient = MittwaldAPIV2Client.newUnauthenticated();

    if (apiBaseUrl) {
      this.apiClient.axios.defaults.baseURL = apiBaseUrl;
    }
  }

  public async getPublicKey(serial: string): Promise<string> {
    const response =
      await this.apiClient.marketplace.extensionGetPublicKey({ serial });

    if (response.status !== 200) {
      throw new Error(
        `Failed to fetch public key for serial "${serial}": HTTP ${String(response.status)}`,
      );
    }

    return response.data.key;
  }
}

export class CachingPublicKeyProvider implements PublicKeyProvider {
  private readonly delegate: PublicKeyProvider;
  private readonly cache = new Map<string, string>();

  public constructor(delegate: PublicKeyProvider) {
    this.delegate = delegate;
  }

  public async getPublicKey(serial: string): Promise<string> {
    const cached = this.cache.get(serial);
    if (cached) {
      return cached;
    }

    const publicKey = await this.delegate.getPublicKey(serial);
    this.cache.set(serial, publicKey);
    return publicKey;
  }
}
