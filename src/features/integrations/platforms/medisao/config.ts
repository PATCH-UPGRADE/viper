import { z } from "zod";
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

/**
 * MedISAO issues one API token per consumer and accepts it only as
 * `Authorization: Bearer`.
 *
 */
export const credentialSchema = z.object({
  apiToken: z.string().min(1, "An API token is required"),
});
export type MedIsaoCreds = z.infer<typeof credentialSchema>;
