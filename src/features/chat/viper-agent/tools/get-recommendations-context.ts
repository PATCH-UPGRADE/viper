import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { generateMemoryMarkdown } from "../../utils";

type AssetWithDeviceGroup = Prisma.AssetGetPayload<{
  include: { deviceGroup: true };
}>;

function assetToMarkdown(a: AssetWithDeviceGroup): string {
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

type VulnerabilityFlat = Prisma.VulnerabilityGetPayload<Record<string, never>>;

function vulnerabilityToMarkdown(v: VulnerabilityFlat): string {
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

type RemediationFlat = Prisma.RemediationGetPayload<Record<string, never>>;

function remediationToMarkdown(r: RemediationFlat): string {
  const lines = [
    `### [${r.id}]`,
    `- **Linked Vulnerability**: ${r.vulnerabilityId ?? "N/A"}`,
  ];
  if (r.description) lines.push(`- **Description**: ${r.description}`);
  if (r.narrative) lines.push(`- **How to Apply**: ${r.narrative}`);
  return lines.join("\n");
}

function generateContextMarkdown(
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

export const getRecommendationsContext = createTool({
  name: "get_recommendations_context",
  description:
    "Retrieve full context about the current user and environment before responding. Returns saved memories plus all assets, vulnerabilities, and remediations in the system.",
  parameters: z.object({}),
  handler: async (_, { network }) => {
    const userId = network?.state.data.userId as string | undefined;
    if (!userId) return "No user context available.";

    const [memories, assets, vulnerabilities, remediations] = await Promise.all(
      [
        prisma.memory.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
        }),
        prisma.asset.findMany({ include: { deviceGroup: true } }),
        prisma.vulnerability.findMany(),
        prisma.remediation.findMany(),
      ],
    );

    return `${generateMemoryMarkdown(memories)}\n\n${generateContextMarkdown(assets, vulnerabilities, remediations)}`;
  },
});
