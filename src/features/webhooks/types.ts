import z from "zod";
import { AuthType, TriggerEnum } from "@/generated/prisma";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import { safeUrlSchema } from "@/lib/schemas";
import { authenticationSchema } from "../integrations/types";

const triggerEnumArray = z.array(z.enum(TriggerEnum));

export const webhookInputSchema = z
  .object({
    name: z.string().min(1),
    callbackUrl: safeUrlSchema,
    triggers: triggerEnumArray.min(1, "At least one trigger is required"),
    authType: z.enum(AuthType),
    authentication: authenticationSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.authType !== "None" && !value.authentication) {
      ctx.addIssue({
        code: "custom",
        message:
          "Authentication details are required for the selected auth type.",
        path: ["authentication"],
      });
    }
  });

export const updateWebhookSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  callbackUrl: safeUrlSchema,
  triggers: triggerEnumArray,
});

export const webhookResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  callbackUrl: z.string(),
  triggers: triggerEnumArray,
  authType: z.enum(AuthType),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const paginatedWebhooksResponseSchema = createPaginatedResponseSchema(
  webhookResponseSchema,
);

export type WebhookFormValues = z.infer<typeof webhookInputSchema>;
