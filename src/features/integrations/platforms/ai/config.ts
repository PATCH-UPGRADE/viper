import { z } from "zod";
import { authCredentialSchema } from "@/features/integrations/core/credentials";
import { ResourceType } from "@/generated/prisma";
import { safeUrlSchema } from "@/lib/schemas";

/**
 * What an operator has to provide for an AI integration.
 *
 * Single-resource: one Integration = one resource, named here rather than by a
 * column. Only code-defined platforms sync several resources from one row.
 */
export const configSchema = z.object({
  integrationUri: safeUrlSchema,
  resource: z.enum(ResourceType),
  /** Was `Integration.prompt`. Handed to the n8n agent verbatim. */
  additionalInstructions: z.string().optional(),
});
export type AiConfig = z.infer<typeof configSchema>;

/** basic | bearer | header | none */
export const credentialSchema = authCredentialSchema;
export type AiCreds = z.infer<typeof credentialSchema>;
