import { z } from "zod";

const apiVersionSchema = { apiVersion: z.literal("v1") };
const variantKeySchema = { variantKey: z.string().optional() };
const idSchema = { id: z.string() };
const contextSchema = {
  context: z.looseObject({
    id: z.string(),
    kind: z.union([z.literal("project"), z.literal("customer")]),
  }),
};
const consentedScopesSchema = { consentedScopes: z.array(z.string()) };
const stateSchema = { state: z.looseObject({ enabled: z.boolean() }) };
const metaSchema = {
  meta: z.looseObject({
    extensionId: z.string(),
    contributorId: z.string(),
  }),
};
const secretSchema = { secret: z.string() };
const requestSchema = {
  request: z.looseObject({
    id: z.string(),
    createdAt: z.iso.datetime(),
    target: z.looseObject({ method: z.string() }),
  }),
};

export const addedSchema = z
  .looseObject({
    ...apiVersionSchema,
    ...idSchema,
    kind: z.literal("ExtensionAddedToContext"),
    ...contextSchema,
    ...consentedScopesSchema,
    ...stateSchema,
    ...metaSchema,
    ...secretSchema,
    ...requestSchema,
    ...variantKeySchema,
  });

export const updatedSchema = z.looseObject({
  ...apiVersionSchema,
  ...idSchema,
  kind: z.literal("InstanceUpdated"),
  ...contextSchema,
  ...consentedScopesSchema,
  ...stateSchema,
  ...metaSchema,
  ...requestSchema,
  ...variantKeySchema,
});

export const secretRotatedSchema = z
  .looseObject({
    ...apiVersionSchema,
    ...idSchema,
    kind: z.literal("SecretRotated"),
    ...contextSchema,
    ...variantKeySchema,
    ...secretSchema,
    ...requestSchema,
  });

export const removedSchema = z
  .looseObject({
    ...apiVersionSchema,
    ...idSchema,
    kind: z.literal("InstanceRemovedFromContext"),
    ...contextSchema,
    ...consentedScopesSchema,
    ...stateSchema,
    ...metaSchema,
    ...requestSchema,
    ...variantKeySchema,
  });
