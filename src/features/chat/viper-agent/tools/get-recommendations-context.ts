import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import prisma from "@/lib/db";
import type { Asset, Vulnerability, Remediation } from "@/generated/prisma";
import { generateMemoryMarkdown } from "../../utils";

function generateContextMarkdown(
  assets: Asset[],
  vulnerabilities: Vulnerability[],
  remediations: Remediation[],
): string {
  const assetLines =
    assets.length === 0
      ? "No assets found."
      : assets
          .map(
            (a) =>
              `- **${a.hostname ?? a.ip ?? a.id}** — Role: ${a.role ?? "Unknown"}, Status: ${a.status ?? "Unknown"}`,
          )
          .join("\n");

  const vulnLines =
    vulnerabilities.length === 0
      ? "No vulnerabilities found."
      : vulnerabilities
          .map(
            (v) =>
              `- **${v.cveId ?? v.id}** — Severity: ${v.severity ?? "Unknown"}, CVSS: ${v.cvssScore ?? "N/A"}`,
          )
          .join("\n");

  const remLines =
    remediations.length === 0
      ? "No remediations found."
      : remediations
          .map((r) => `- [${r.id}] ${r.description ?? "Untitled"}`)
          .join("\n");

  return `## Assets

${assetLines}

## Vulnerabilities

${vulnLines}

## Remediations

${remLines}`;
}

export const getRecommendationsContext = createTool({
  name: "get_recommendations_context",
  description:
    "Retrieve full context about the current user and environment before responding. Returns saved memories plus all assets, vulnerabilities, and remediations in the system.",
  parameters: z.object({}),
  handler: async (_, { network }) => {
    const userId = network?.state.data.userId as string | undefined;
    if (!userId) return "No user context available.";

    const [memories, assets, vulnerabilities, remediations] = await Promise.all([
      prisma.memory.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.asset.findMany(),
      prisma.vulnerability.findMany(),
      prisma.remediation.findMany(),
    ]);

    return `${generateMemoryMarkdown(memories)}\n\n${generateContextMarkdown(assets, vulnerabilities, remediations)}`;
  },
});
