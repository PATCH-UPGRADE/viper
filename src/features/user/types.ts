import { z } from "zod";
import { resourceTypeSchema } from "../integrations/types";

export const apiTokenInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  expiresIn: z.union([z.number().int(), z.undefined()]),
  resourceType: resourceTypeSchema.optional(),
});
export type ApiTokenFormValues = z.infer<typeof apiTokenInputSchema>;
