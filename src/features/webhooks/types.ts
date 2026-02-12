import z from "zod";
import { AuthType, TriggerEnum } from "@/generated/prisma";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import { authSchema, safeUrlSchema } from "@/lib/schemas";

const triggerEnumArray = z.array(z.enum(TriggerEnum));

export const webhookInputSchema = authSchema.safeExtend({
  name: z.string().min(1),
  callbackUrl: safeUrlSchema,
  triggers: triggerEnumArray.min(1, "At least one trigger is required"),
});

export const updateWebhookSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  callbackUrl: safeUrlSchema,
  triggers: triggerEnumArray.min(1, "At least one trigger is required"),
});

export const webhookResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  callbackUrl: z.string(),
  triggers: triggerEnumArray,
  authType: z.enum(Object.values(AuthType)),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type WebhookResponse = z.infer<typeof webhookResponseSchema>;

export const paginatedWebhooksResponseSchema = createPaginatedResponseSchema(
  webhookResponseSchema,
);

export type WebhookFormValues = z.infer<typeof webhookInputSchema>;
