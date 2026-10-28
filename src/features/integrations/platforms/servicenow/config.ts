// Client-safe: the integration create form reads this shape, so this file must
// not import anything server-only.

import { z } from "zod";
import { safeUrlSchema } from "@/lib/schemas";

export const configSchema = z.object({
  // Basic auth sends the password on every request, so plain http exposes it.
  instanceUrl: safeUrlSchema.refine((url) => /^https:\/\//i.test(url), {
    message: "The ServiceNow instance URL must use https",
  }),
});
export type ServiceNowConfig = z.infer<typeof configSchema>;

/**
 * A ServiceNow user with read access to the synced table.
 *
 * Not `authCredentialSchema`: that also accepts `None`, so a user can save an
 * integration with no credentials, and the Table API refuses every request.
 */
export const credentialSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type ServiceNowCreds = z.infer<typeof credentialSchema>;
