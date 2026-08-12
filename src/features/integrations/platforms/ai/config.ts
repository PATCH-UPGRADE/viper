import { z } from "zod";
import { authCredentialSchema } from "@/features/integrations/core/credentials";
import { genericConfigSchema } from "@/features/integrations/core/sync/resources";
import { safeUrlSchema } from "@/lib/schemas";

/**
 * What an operator has to provide for an AI integration.
 *
 * Composed from `genericConfigSchema` — see the note in partner's config for
 * why `resource` is inherited rather than redeclared.
 */
export const configSchema = genericConfigSchema.extend({
  integrationUri: safeUrlSchema,
  additionalInstructions: z.string().optional(), // given to n8n agent
});
export type AiConfig = z.infer<typeof configSchema>;

/** basic | bearer | header | none */
export const credentialSchema = authCredentialSchema;
export type AiCreds = z.infer<typeof credentialSchema>;
