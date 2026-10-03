import { z } from "zod";
import { safeUrlSchema } from "@/lib/schemas";

export const configSchema = z.object({
  providerMetadataUrl: safeUrlSchema,
});

export type CsafConfig = z.infer<typeof configSchema>;

// No credentials: every feed we can read is public
export const credentialSchema = z.object({});
export type CsafCreds = z.infer<typeof credentialSchema>;
