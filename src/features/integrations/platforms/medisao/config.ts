import { z } from "zod";
import { authCredentialSchema } from "@/features/integrations/core/credentials";
import { safeUrlSchema } from "@/lib/schemas";

/**
 * What an operator provides for a MedISAO channel subscription.
 *
 * Deliberately not built on `genericConfigSchema`: that adds `resource`, which
 * only a platform without resource modules needs. MedISAO has them.
 */
export const configSchema = z.object({
  apiUrl: safeUrlSchema,
});
export type MedIsaoConfig = z.infer<typeof configSchema>;

/** MedISAO issues one API key per consumer, sent as `Authorization: Bearer`. */
export const credentialSchema = authCredentialSchema;
export type MedIsaoCreds = z.infer<typeof credentialSchema>;
