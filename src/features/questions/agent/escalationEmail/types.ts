export type EscalationVendorCandidate = {
  id: string;
  displayName: string;
  contacts: { id: string; name: string; title: string | null; email: string }[];
};

export type EscalationContext = {
  manufacturerName: string;
  productName: string;
  vendors: EscalationVendorCandidate[];
  markdown: string;
};

export type EscalationTarget = {
  companyName: string;
  contacts: { email: string; name?: string }[];
  toEmails: string[];
};
