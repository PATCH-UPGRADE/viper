import { z } from "zod";
import { authCredentialSchema } from "@/features/integrations/core/credentials";
import { ResourceType } from "@/generated/prisma";
import { safeUrlSchema } from "@/lib/schemas";

/**
 * What an operator has to provide for an AI integration.
 */
export const configSchema = z.object({
  integrationUri: safeUrlSchema,
  resource: z.enum(ResourceType), // one integration per resource
  additionalInstructions: z.string().optional(), // given to n8n agent
});
export type AiConfig = z.infer<typeof configSchema>;

/** basic | bearer | header | none */
export const credentialSchema = authCredentialSchema;
export type AiCreds = z.infer<typeof credentialSchema>;
