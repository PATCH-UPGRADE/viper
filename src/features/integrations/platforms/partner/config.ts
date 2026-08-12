import type { z } from "zod";
import { authCredentialSchema } from "@/features/integrations/core/credentials";
import { genericConfigSchema } from "@/features/integrations/core/sync/resources";
import { safeUrlSchema } from "@/lib/schemas";

/**
 * What an operator has to provide for a partner integration (Blueflow, Helm).
 */
export const configSchema = genericConfigSchema.extend({
  integrationUri: safeUrlSchema,
});
export type PartnerConfig = z.infer<typeof configSchema>;

/** basic | bearer | header | none */
export const credentialSchema = authCredentialSchema;
export type PartnerCreds = z.infer<typeof credentialSchema>;
