import { z } from "zod";
import { authCredentialSchema } from "@/features/integrations/core/credentials";
import { ResourceType } from "@/generated/prisma";
import { safeUrlSchema } from "@/lib/schemas";

/**
 * What an operator has to provide for a partner integration (Blueflow, Helm).
 */
export const configSchema = z.object({
  integrationUri: safeUrlSchema,
  resource: z.enum(ResourceType), // one integration per resource
});
export type PartnerConfig = z.infer<typeof configSchema>;

/** basic | bearer | header | none */
export const credentialSchema = authCredentialSchema;
export type PartnerCreds = z.infer<typeof credentialSchema>;
