export interface ExtensionInstance {
  id: string;
  contextId: string;
  consentedScopes: string[];
  secret: string;
  enabled: boolean;
  addedAt: Date;
  updatedAt?: Date;
  variantKey?: string;
}
