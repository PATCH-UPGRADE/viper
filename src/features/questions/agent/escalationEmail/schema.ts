import { z } from "zod";

export function buildEscalationEmailSchema(
  audience: "VENDOR" | "MANUFACTURER",
  vendorIds: string[],
  contactIds: string[],
) {
  const vendorId =
    audience === "MANUFACTURER"
      ? z.null()
      : z.enum(vendorIds as [string, ...string[]]);

  const contactId =
    contactIds.length > 0
      ? z.enum(contactIds as [string, ...string[]])
      : z.string();

  return z.object({
    vendorId: vendorId.describe(
      audience === "MANUFACTURER"
        ? "Always null"
        : "Id of the chosen vendor to email, from the VENDOR list.",
    ),
    contactIds: z
      .array(contactId)
      .describe(
        "Contact ids belonging to the vendor you chose. Empty array when no listed contact clearly fits, and always when vendorId is null.",
      ),
    reasonWhy: z
      .string()
      .describe(
        "INTERNAL note shown to the hospital user under 'Why send this:', not part of the email. One or two sentences on what answering this unblocks.",
      ),
    subject: z
      .string()
      .describe("Email subject line; name the product and the CVE."),
    body: z
      .string()
      .describe(
        "Plain-text email body, ending with a sign-off line and nothing after it.",
      ),
  });
}

export type EscalationDraft = z.infer<
  ReturnType<typeof buildEscalationEmailSchema>
>;
