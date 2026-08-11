import "server-only";
import type { QuestionWithIssue } from "@/features/questions/types";
import type { Prisma, QuestionAudience } from "@/generated/prisma";
import prisma from "@/lib/db";
import { deviceGroupWhereForMatching } from "@/lib/device-matching";
import type { EscalationContext, EscalationVendorCandidate } from "./types";

function renderEscalationPrompt({
  audience,
  manufacturerName,
  productName,
  question,
  vendors,
}: {
  audience: QuestionAudience;
  manufacturerName: string;
  productName: string;
  question: QuestionWithIssue;
  vendors: EscalationVendorCandidate[];
}): string {
  const vuln = question.issue.vulnerability;
  const vendorSection = audience === "VENDOR"
    ? [
        "### VENDOR - under contract to service these assets",
        ...vendors.map((vendor) => {
          const contacts = vendor.contacts.length
            ? vendor.contacts
                .map((contact) => {
                  const title = contact.title ? `${contact.title}` : "";
                  return ` - id: ${contact.id} | ${contact.name} | ${title} | ${contact.email}`;
                })
                .join("\n")
            : " (none on file)";
          return `-id: ${vendor.id} | ${vendor.displayName}\n contacts:\n${contacts}`;
        }),
        "",
      ].join("\n")
    : null;
    

  return [
    "## Device",
    `Manufacturer: ${manufacturerName}`,
    `Product: ${productName}`,
    "",
    "## Advisory",
    `${vuln.cveId ?? vuln.id} (severity: ${vuln.severity})`,
    "<untrusted_source_material>",
    vuln.description ?? "(no description provided)",
    "</untrusted_source_material>",
    `Why this is still under investigation: ${question.issue.statusNotes ?? "(not recorded)"}`,
    "",
    "## The question we could not answer internally",
    `Title: ${question.title}`,
    `Why it matters: ${question.reasonWhy}`,
    "",
    vendorSection,
    "",
    `### MANUFACTURER - ${manufacturerName}`,
    "Built the device. We store no contact address for manufacturers, so the user will supply one",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export async function gatherEscalationContext(
  question: QuestionWithIssue,
  audience: QuestionAudience
): Promise<EscalationContext | null> {
  const matching = question.issue.deviceGroupMatching;
  if (!matching) return null;

  const manufacturerName: string = matching.manufacturer.canonicalDisplayName;
  const productName: string =
    matching.product?.canonicalDisplayName ?? `All ${manufacturerName} devices`;
  const assetWhere: Prisma.AssetWhereInput = {
    deviceGroup: deviceGroupWhereForMatching(matching),
  };

  const rows = await prisma.vendor.findMany({
    where: { contracts: { some: { covers: { some: { asset: assetWhere } } } } },
    select: {
      id: true,
      canonicalDisplayName: true,
      contacts: {
        where: {
          email: { not: null },
        },
        select: { id: true, name: true, title: true, email: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { canonicalDisplayName: "asc" },
  });

  const vendors: EscalationVendorCandidate[] = rows.map((vendor) => ({
    id: vendor.id,
    displayName: vendor.canonicalDisplayName,
    contacts: vendor.contacts.map((contact) => ({
      ...contact,
      email: contact.email as string,
    })),
  }));

  return {
    manufacturerName,
    productName,
    vendors,
    markdown: renderEscalationPrompt({
      audience,
      manufacturerName,
      productName,
      question,
      vendors,
    }),
  };
}

const INTRO = `You draft a clarification email for a hospital's security and biomedical engineer team. They are checking whether
a published vulnerability affects their medical devices and have hit a question they cannot answer from their own records.`;

const WITH_VENDORS = `1. vendorId - pick the vendor best placed to answer. Prefer one whose listed contacts cover the subject of the question.
2. contactIds - ids from the chosen vendor's list only. Match the role to the question: a field service engineer knows what is installed and when it can be serviced; a biomed or account
lead handles scheduling and contractual questions. Return an empty array when no listed person clearly fits - the user will supply an address.

3. Write reasonWhy, subject, body.`;

const TO_MANUFACTURER = `This email goes to the manufacturer that built the device. Set vendorId to null and contactIds to an empty array - we hold no manufacturer addresses, so the user will supply one. Write reasonWhy, subject, body.`;

export const WRITING = `reasonWhy is INTERNAL. It appears in the app under "Why send this:" and is never sent. One or two sentences to colleague on what answering this unblocks.
Do not write it as part of the email. Subject names the product and the CVE. The body is plain text: address the company by exactly the name given, say who is writing and why, state the question plainly, and say what form of answer helps
(a version confirmation, an affected-model list). Under 200 words, direct and factual, no deadlines or pressure. End with a sign-off line such as "Best regards," and nothing after it. The app appends the sender's name, so a name you write will appear twice.
`;

export function buildSystemPrompt(audience: QuestionAudience): string {
  return [
    INTRO,
    audience === "VENDOR" ? WITH_VENDORS : TO_MANUFACTURER,
    WRITING,
  ].join("\n\n");
}
