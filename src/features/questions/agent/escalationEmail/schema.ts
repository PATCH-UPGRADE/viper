import { z } from "zod";

const idFrom = (ids: string[]) =>
  ids.length > 0 ? z.enum(ids as [string, ...string[]]) : z.string();

export function buildEscalationEmailSchema(
  vendorIds: string[],
  contactIds: string[],
) {
  const vendorId =
    vendorIds.length > 0
      ? z.enum(vendorIds as [string, ...string[]]).nullable()
      : z.null();
  const contactId =
    contactIds.length > 0
      ? z.enum(vendorIds as [string, ...string[]])
      : z.string();

  return z.object({
    audience: z
      .enum(["VENDOR", "MANUFACTURER"])
      .describe(
        "MANUFACTURER when only the company that built the device can answer; VENDOR when the company contracted to service our units can answer. Must be MANUFACTURER if no vendors are listed.",
      ),
    vendorId: vendorId.describe(
      "Id of the chosen vendor. Null when audience is MANUFACTURER.",
    ),
    contactIds: z
      .array(contactId)
      .describe(
        "Contact ids from the chosen vendor. Empty array when no listed contact is clearly fits, or when audience is MANUFACTURER - the user types an address in.",
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
