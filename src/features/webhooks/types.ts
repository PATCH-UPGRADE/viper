import { TriggerEnum, AuthType } from "@/generated/prisma";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import z from "zod";
import { authenticationSchema } from "../integrations/types";

export const webhookInputSchema = z.object({
  name: z.string(),
  callbackUrl: z.string(),
  triggers: z.array(z.enum(TriggerEnum)),
  authType: z.enum(AuthType),
  authentication: authenticationSchema.optional(),
});

export const updateWebhookSchema = z.object({
  id: z.string(),
  name: z.string(),
  callbackUrl: z.string(),
  triggers: z.array(z.enum(TriggerEnum)),
});

export const webhookResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  callbackUrl: z.string(),
  triggers: z.array(z.enum(TriggerEnum)),
  authType: z.enum(AuthType),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const paginatedWebhooksResponseSchema =
  createPaginatedResponseSchema(webhookResponseSchema);

export type WebhookFormValues = z.infer<typeof webhookInputSchema>;
