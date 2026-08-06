import { z } from "zod";

export const escalationEmailschema = z.object({
  audience: z.enum(["VENDOR", "MANUFACTURER"]),
  companyName: z.string(),
  productName: z.string(),
  reasonWhy: z.string(),
  subject: z.string(),
  body: z.string(),
});

export type EscalationDraft = z.infer<typeof escalationEmailschema>;
