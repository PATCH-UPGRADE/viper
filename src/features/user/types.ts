import z from "zod";

export const apiTokenInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  expiresIn: z.union([z.number().int(), z.undefined()]),
});
export type ApiTokenFormValues = z.infer<typeof apiTokenInputSchema>;
