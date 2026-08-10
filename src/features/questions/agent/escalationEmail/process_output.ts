import type { EscalationDraft } from "./schema";
import type { EscalationTarget, EscalationVendorCandidate } from "./types";

export function resolveEscalationTarget(
  draft: Pick<EscalationDraft, "vendorId" | "contactIds">,
  context: { manufacturerName: string; vendors: EscalationVendorCandidate[] },
): EscalationTarget {
  const vendor = draft.vendorId
    ? context.vendors.find((vendor) => vendor.id === draft.vendorId)
    : undefined;

  if (!vendor) {
    return {
      audience: "MANUFACTURER",
      companyName: context.manufacturerName,
      contacts: [],
      toEmails: [],
    };
  }

  const chosenContact = new Set(draft.contactIds);
  return {
    audience: "VENDOR",
    companyName: vendor.displayName,
    contacts: vendor.contacts.map((contact) => ({
      email: contact.email,
      name: contact.name,
    })),
    toEmails: vendor.contacts
      .filter((contact) => chosenContact.has(contact.id))
      .map((contact) => contact.email),
  };
}
