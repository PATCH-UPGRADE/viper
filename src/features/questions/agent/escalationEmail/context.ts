import "server-only";
import type { QuestionWithIssue } from "@/features/questions/types";
import type { QuestionAudience } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  deviceGroupWhereForMatching,
  matchingAppliesToDeviceGroup,
} from "@/lib/device-matching";
import { effectiveAudience } from "./process_output";
import type {
  EscalationContext,
  EscalationRelationshipCandidate,
} from "./types";

// for either deviceGroupMatching or Asset
type IssueDevice = {
  manufacturerName: string;
  productName: string;
  assetIds: string[];
};

async function resolveIssueDevice(
  issue: QuestionWithIssue["issue"],
): Promise<IssueDevice | null> {
  const matching = issue.deviceGroupMatching;
  if (matching) {
    const manufacturerName = matching.manufacturer.canonicalDisplayName;

    const candidates = await prisma.deviceGroup.findMany({
      where: deviceGroupWhereForMatching(matching),
      select: {
        id: true,
        manufacturerId: true,
        productId: true,
        versionId: true,
        version: { select: { canonicalName: true } },
        assets: { select: { id: true } },
      },
    });

    return {
      manufacturerName,
      productName:
        matching.product?.canonicalDisplayName ??
        `All ${manufacturerName} devices`,
      assetIds: candidates
        .filter((group) => matchingAppliesToDeviceGroup(matching, group))
        .flatMap((group) => group.assets.map((asset) => asset.id)),
    };
  }

  const group = issue.asset?.deviceGroup;
  if (group?.manufacturer) {
    const manufacturerName = group.manufacturer.canonicalDisplayName;
    return {
      manufacturerName,
      productName:
        group.product?.canonicalDisplayName ??
        `All ${manufacturerName} devices`,
      assetIds: [issue.asset!.id],
    };
  }
  return null;
}
/**
 *  Every vendor-linked ManagesRelationship covering any of these assets
 */
async function gatherRelationships(
  assetIds: string[],
): Promise<EscalationRelationshipCandidate[]> {
  if (assetIds.length === 0) return [];
  const rows = await prisma.managesRelationship.findMany({
    where: {
      vendorId: { not: null },
      assets: { some: { id: { in: assetIds } } },
    },
    select: {
      id: true,
      responsibilities: true,
      assets: { where: { id: { in: assetIds } }, select: { id: true } },
      vendor: {
        select: {
          canonicalDisplayName: true,
          contacts: {
            where: { email: { not: null } },
            select: { id: true, name: true, title: true, email: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  return rows
    .filter((row) => row.vendor !== null)
    .map((row) => ({
      id: row.id,
      vendorName: row.vendor!.canonicalDisplayName,
      responsibilities: row.responsibilities,
      assetCount: row.assets.length,
      contacts: row.vendor!.contacts.map((contact) => ({
        ...contact,
        email: contact.email as string,
      })),
    }))
    .sort((a, b) => b.assetCount - a.assetCount);
}

function renderEscalationPrompt({
  audience,
  device,
  question,
  relationships,
}: {
  audience: QuestionAudience;
  device: IssueDevice;
  question: QuestionWithIssue;
  relationships: EscalationRelationshipCandidate[];
}): string {
  const vuln = question.issue.vulnerability;
  const totalAssets = device.assetIds.length;
  const targetSection =
    audience === "VENDOR"
      ? [
          "## Who mangaes these assets",
          "Each entry is a management relationship the hospital has on file. Pick the one whose responsibilities cover the subject of the question.",
          "",
          ...relationships.map((rel) => {
            const contacts = rel.contacts.length
              ? rel.contacts
                  .map(
                    (contact) =>
                      ` - id: ${contact.id} | ${contact.name} | ${contact.title ?? ""} | ${contact.email}`,
                  )
                  .join("\n")
              : " (none on file)";
            return [
              `- id: ${rel.id} | ${rel.vendorName}`,
              ` covers: ${rel.assetCount} of ${totalAssets} affected assets`,
              ` responsibilities: ${rel.responsibilities}`,
              "contacts: ",
              contacts,
            ].join("\n");
          }),
        ].join("\n")
      : [
          `## MANUFACTURER - ${device.manufacturerName}`,
          "Built the device. We store no contact address for manufacturers, so the user will supply one.",
        ].join("\n");

  return [
    "## Device",
    `Manufacturer: ${device.manufacturerName}`,
    `Product: ${device.productName}`,
    `Affected assets: ${totalAssets}`,
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
    targetSection,
    "",
  ].join("\n");
}

export async function gatherEscalationContext(
  question: QuestionWithIssue,
  audience: QuestionAudience,
): Promise<EscalationContext | null> {
  const device = await resolveIssueDevice(question.issue);
  if (!device) return null;

  const relationships =
    audience === "VENDOR" ? await gatherRelationships(device.assetIds) : [];

  const finalAudience = effectiveAudience(audience, relationships.length);

  return {
    audience: finalAudience,
    manufacturerName: device.manufacturerName,
    productName: device.productName,
    relationships,
    markdown: renderEscalationPrompt({
      audience: finalAudience,,
      device,
      question,
      relationships,
    }),
  };
}

const INTRO = `You draft a clarification email for a hospital's security and biomedical engineer team. They are checking whether
a published vulnerability affects their medical devices and have hit a question they cannot answer from their own records.`;

const WITH_RELATIONSHIPS = `1. managesRelationshipId - pick the management relationship best placed to answer. Choose on the responsibilities text: it says what that company actually does for these assets. A question about how units are deployed, configured or serviced goes to whoever does that work, not to whoever covers the most assets.
2. contactIds - ids from the chosen relationship's contact list only. Match the role to the question: a field service engineer knows what is installed and when it can be serviced; a biomed or account
lead handles scheduling and contractual questions.
3. Write reasonWhy, subject, body.`;

const TO_MANUFACTURER = `This email goes to the manufacturer that built the device. We hold no manufacturer addresses, so the user will supply one. Write reasonWhy, subject, body.`;

export const WRITING = `reasonWhy is INTERNAL. It appears in the app under "Why send this:" and is never sent. One or two sentences to colleague on what answering this unblocks.
Do not write it as part of the email. Subject names the product and the CVE. The body is plain text: address the company by exactly the name given, say who is writing and why, state the question plainly, and say what form of answer helps
(a version confirmation, an affected-model list). Under 200 words, direct and factual, no deadlines or pressure. End with a sign-off line such as "Best regards," and nothing after it. The app appends the sender's name, so a name you write will appear twice.
`;

export function buildSystemPrompt(audience: QuestionAudience): string {
  return [
    INTRO,
    audience === "VENDOR" ? WITH_RELATIONSHIPS : TO_MANUFACTURER,
    WRITING,
  ].join("\n\n");
}
