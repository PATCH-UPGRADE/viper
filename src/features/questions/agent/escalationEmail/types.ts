import type { QuestionAudience } from "@/generated/prisma";

export type EscalationTarget = {
  companyName: string;
  contacts: { email: string; name?: string }[];
  toEmails: string[];
};

export type EscalationContact = {
  id: string;
  name: string;
  title: string | null;
  email: string;
};

export type EscalationRelationshipCandidate = {
  id: string;
  vendorName: string;
  responsibilities: string;
  assetCount: number;
  contacts: EscalationContact[];
};

export type EscalationContext = {
  audience: QuestionAudience;
  manufacturerName: string;
  productName: string;
  relationships: EscalationRelationshipCandidate[];
  markdown: string;
};
