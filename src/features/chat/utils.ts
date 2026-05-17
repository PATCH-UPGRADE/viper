// Client-safe constants and utilities belong in this file.
// Server-only agent config (e.g. DEFAULT_CHAT_MODEL) lives in viper-agent/constants.ts.
import type { Memory, Prisma } from "@/generated/prisma";

export type AssetWithDeviceGroup = Prisma.AssetGetPayload<{
  include: { deviceGroup: true };
}>;

export type VulnerabilityFlat = Prisma.VulnerabilityGetPayload<
  Record<string, never>
>;

export type RemediationFlat = Prisma.RemediationGetPayload<
  Record<string, never>
>;

interface AssetForMarkdown {
  id: string;
  hostname?: string | null;
  ip?: string | null;
  macAddress?: string | null;
  role?: string | null;
  status?: string | null;
  networkSegment?: string | null;
  serialNumber?: string | null;
  deviceGroup: {
    manufacturer?: string | null;
    modelName?: string | null;
    cpe: string;
    version?: string | null;
  };
}

export function assetToMarkdown(a: AssetForMarkdown): string {
  const lines = [
    `### ${a.hostname ?? a.ip ?? a.id}`,
    `- **IP**: ${a.ip ?? "N/A"}`,
    `- **MAC Address**: ${a.macAddress ?? "N/A"}`,
    `- **Role**: ${a.role ?? "Unknown"}`,
    `- **Status**: ${a.status ?? "Unknown"}`,
    `- **Network Segment**: ${a.networkSegment ?? "N/A"}`,
    `- **Serial Number**: ${a.serialNumber ?? "N/A"}`,
    `- **Device Group**: ${a.deviceGroup.manufacturer ?? ""} ${a.deviceGroup.modelName ?? ""} (CPE: ${a.deviceGroup.cpe})`.trim(),
    `- **Device Group Version**: ${a.deviceGroup.version ?? "N/A"}`,
  ];
  return lines.join("\n");
}

export function vulnerabilityToMarkdown(v: VulnerabilityFlat): string {
  const lines = [
    `### ${v.cveId ?? v.id}`,
    `- **Severity**: ${v.severity}`,
    `- **Priority**: ${v.priority}`,
    `- **CVSS Score**: ${v.cvssScore ?? "N/A"}`,
    `- **CVSS Vector**: ${v.cvssVector ?? "N/A"}`,
    `- **EPSS Score**: ${v.epss != null ? `${(v.epss * 100).toFixed(2)}%` : "N/A"}`,
    `- **In CISA KEV**: ${v.inKEV ? "Yes" : "No"}`,
  ];
  if (v.exploitUri) lines.push(`- **Exploit URI**: ${v.exploitUri}`);
  if (v.affectedComponents.length > 0)
    lines.push(`- **Affected Components**: ${v.affectedComponents.join(", ")}`);
  if (v.description) lines.push(`- **Description**: ${v.description}`);
  if (v.narrative) lines.push(`- **Exploit Narrative**: ${v.narrative}`);
  if (v.impact) lines.push(`- **Clinical Impact**: ${v.impact}`);
  return lines.join("\n");
}

export function remediationToMarkdown(r: RemediationFlat): string {
  const lines = [
    `### [${r.id}]`,
    `- **Linked Vulnerability**: ${r.vulnerabilityId ?? "N/A"}`,
  ];
  if (r.description) lines.push(`- **Description**: ${r.description}`);
  if (r.narrative) lines.push(`- **How to Apply**: ${r.narrative}`);
  return lines.join("\n");
}

export function generateContextMarkdown(
  assets: AssetWithDeviceGroup[],
  vulnerabilities: VulnerabilityFlat[],
  remediations: RemediationFlat[],
): string {
  const assetSection =
    assets.length === 0
      ? "No assets found."
      : assets.map(assetToMarkdown).join("\n\n");

  const vulnSection =
    vulnerabilities.length === 0
      ? "No vulnerabilities found."
      : vulnerabilities.map(vulnerabilityToMarkdown).join("\n\n");

  const remSection =
    remediations.length === 0
      ? "No remediations found."
      : remediations.map(remediationToMarkdown).join("\n\n");

  return `## Assets

${assetSection}

## Vulnerabilities

${vulnSection}

## Remediations

${remSection}`;
}

export function generateMemoryMarkdown(memories: Memory[]): string {
  if (memories.length === 0) return "## Memories\n\nNo memories saved yet.";
  return `## Memories\n\n${memories.map((m) => `- [${m.id}] ${m.content}`).join("\n")}`;
}

export const USER_ROLES = [
  "CISO",
  "Clinical Staff",
  "IT staff",
  "hospital administration",
  "biomedical engineer",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ASSET_ROLE_INSTRUCTIONS: Record<UserRole, string> = {
  CISO: "The user is a CISO. Focus on organizational risk posture, compliance implications, regulatory exposure, and strategic remediation prioritization. Use executive-level language.",
  "Clinical Staff":
    "The user is clinical staff. Focus on how this asset affects patient care workflows, safety implications, and clinical operations. Avoid deep technical jargon; use clinical terminology.",
  "IT staff":
    "The user is IT staff. Focus on technical details: patch availability, downtime estimates, network dependencies, configuration, and deployment steps. Be precise and actionable.",
  "hospital administration":
    "The user is hospital administration. Focus on operational impact, cost implications, regulatory compliance, and scheduling concerns. Summarize risk in business terms.",
  "biomedical engineer":
    "The user is a biomedical engineer. Focus on device firmware, manufacturer advisories, clinical engineering impact, device interoperability, and maintenance procedures.",
};

export const VULNERABILITY_ROLE_INSTRUCTIONS: Record<UserRole, string> = {
  CISO: "The user is a CISO. Focus on risk exposure, compliance impact, potential financial and reputational consequences, and strategic remediation decisions. Use executive-level language.",
  "Clinical Staff":
    "The user is clinical staff. Focus on which patient care workflows are affected, safety risks, and what clinical workarounds may be needed. Avoid deep technical jargon.",
  "IT staff":
    "The user is IT staff. Focus on technical remediation steps, patching procedures, affected network segments, and expected downtime. Be precise and actionable.",
  "hospital administration":
    "The user is hospital administration. Focus on operational disruption, cost-benefit of remediation timing, regulatory implications, and communication to stakeholders.",
  "biomedical engineer":
    "The user is a biomedical engineer. Focus on affected device models, vendor patches, firmware impacts, device functionality after patching, and interoperability concerns.",
};
