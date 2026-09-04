import type { QuestionAudience } from "@/generated/prisma";
import type { EscalationDraft } from "./schema";
import type {
  EscalationRelationshipCandidate,
  EscalationTarget,
} from "./types";

export function effectiveAudience(
  requested: QuestionAudience,
  relationshipCount: number,
): QuestionAudience {
  return requested === "VENDOR" && relationshipCount === 0
    ? "MANUFACTURER"
    : requested;
}

export function resolveEscalationTarget(
  draft: Pick<EscalationDraft, "managesRelationshipId" | "contactIds">,
  context: {
    manufacturerName: string;
    relationships: EscalationRelationshipCandidate[];
  },
): EscalationTarget {
  const relationship = draft.managesRelationshipId
    ? context.relationships.find(
        (rel) => rel.id === draft.managesRelationshipId,
      )
    : undefined;

  if (!relationship) {
    return {
      companyName: context.manufacturerName,
      contacts: [],
      toEmails: [],
    };
  }

  const chosenContact = new Set(draft.contactIds);
  return {
    companyName: relationship.vendorName,
    contacts: relationship.contacts.map((contact) => ({
      email: contact.email,
      name: contact.name,
    })),
    toEmails: relationship.contacts
      .filter((contact) => chosenContact.has(contact.id))
      .map((contact) => contact.email),
  };
}
