import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  assetToMarkdown,
  generateMemoryMarkdown,
  remediationToMarkdown,
  vulnerabilityToMarkdown,
} from "../../utils";

function shortId(id: string): string {
  return id.slice(0, 8);
}

function generateInventorySummaryTable(assets: AssetForContext[]): string {
  if (assets.length === 0) return "_No assets in inventory._";

  const header = "| Asset | Device | Role | Status | Active Issues |";
  const divider = "|---|---|---|---|---|";
  const rows = assets.map((a) => {
    const label = a.hostname ?? a.ip ?? shortId(a.id);
    const device =
      [a.deviceGroup.manufacturer, a.deviceGroup.modelName]
        .filter(Boolean)
        .join(" ") || a.deviceGroup.cpe;
    const active = (a.issues ?? []).filter((i) => i.status === "ACTIVE").length;
    return `| ${label} (${shortId(a.id)}) | ${device} | ${a.role ?? "—"} | ${a.status ?? "—"} | ${active} |`;
  });

  return [header, divider, ...rows].join("\n");
}

function generateVulnAssetRemMap(
  vulnerabilities: VulnerabilityForContext[],
): string {
  if (vulnerabilities.length === 0) return "_No vulnerabilities found._";

  const header =
    "| Vulnerability | CVSS | EPSS | KEV | Affected Assets | Available Remediations |";
  const divider = "|---|---|---|---|---|---|";
  const rows = vulnerabilities.map((v) => {
    const vid = v.cveId ?? shortId(v.id);
    const cvss = v.cvssScore?.toFixed(1) ?? "—";
    const epss = v.epss != null ? `${(v.epss * 100).toFixed(1)}%` : "—";
    const kev = v.inKEV ? "Yes" : "No";
    const assetLabels =
      v.issues && v.issues.length > 0
        ? v.issues
            .map((i) => i.asset.hostname ?? i.asset.ip ?? shortId(i.asset.id))
            .join(", ")
        : "—";
    const remLabels =
      v.remediations && v.remediations.length > 0
        ? v.remediations.map((r) => `rem-${shortId(r.id)}`).join(", ")
        : "—";
    return `| ${vid} | ${cvss} | ${epss} | ${kev} | ${assetLabels} | ${remLabels} |`;
  });

  return [header, divider, ...rows].join("\n");
}

// ─── Prisma includes ──────────────────────────────────────────────────────────

export const assetContextInclude = {
  deviceGroup: true,
  issues: {
    include: {
      vulnerability: {
        select: { id: true, cveId: true, severity: true, priority: true },
      },
    },
  },
} satisfies Prisma.AssetInclude;

export type AssetForContext = Prisma.AssetGetPayload<{
  include: typeof assetContextInclude;
}>;

export const vulnerabilityContextInclude = {
  affectedDeviceGroups: {
    select: { cpe: true, modelName: true, manufacturer: true },
  },
  remediations: { select: { id: true, description: true } },
  issues: {
    include: {
      asset: {
        select: {
          id: true,
          hostname: true,
          ip: true,
          role: true,
          status: true,
          location: true,
        },
      },
    },
  },
} satisfies Prisma.VulnerabilityInclude;

export type VulnerabilityForContext = Prisma.VulnerabilityGetPayload<{
  include: typeof vulnerabilityContextInclude;
}>;

export const remediationContextInclude = {
  vulnerability: { select: { id: true, cveId: true } },
  affectedDeviceGroups: {
    select: { cpe: true, modelName: true, manufacturer: true },
  },
  issueRemediations: {
    include: {
      issue: {
        include: {
          asset: { select: { id: true, hostname: true, ip: true } },
        },
      },
    },
  },
  artifacts: {
    include: {
      latestArtifact: { select: { artifactType: true } },
    },
  },
} satisfies Prisma.RemediationInclude;

export type RemediationForContext = Prisma.RemediationGetPayload<{
  include: typeof remediationContextInclude;
}>;

// ─── Context generator ────────────────────────────────────────────────────────

function generateContextMarkdown(
  assets: AssetForContext[],
  vulnerabilities: VulnerabilityForContext[],
  remediations: RemediationForContext[],
  role?: string,
): string {
  const sections: string[] = [];

  if (role) {
    sections.push(`## User Role\n\n${role}`);
  }

  sections.push(
    `## Inventory Summary\n\n${generateInventorySummaryTable(assets)}`,
  );

  sections.push(
    `## Vulnerability × Asset × Remediation Map\n\n${generateVulnAssetRemMap(vulnerabilities)}`,
  );

  const assetSection =
    assets.length === 0
      ? "_No assets found._"
      : assets
          .map((a) => assetToMarkdown(a, { includeIssues: true }))
          .join("\n\n");
  sections.push(`## Assets (full)\n\n${assetSection}`);

  const vulnSection =
    vulnerabilities.length === 0
      ? "_No vulnerabilities found._"
      : vulnerabilities
          .map((v) =>
            vulnerabilityToMarkdown(v, {
              includeAssets: true,
              includeRemediations: true,
            }),
          )
          .join("\n\n");
  sections.push(`## Vulnerabilities (full)\n\n${vulnSection}`);

  const remSection =
    remediations.length === 0
      ? "_No remediations found._"
      : remediations.map(remediationToMarkdown).join("\n\n");
  sections.push(`## Remediations (full)\n\n${remSection}`);

  // TODO(network-flow): add "## Network Flow" section here.
  // TODO(workflows): add "## Clinical Workflows" section here.
  // TODO(utilization): add "## Device Utilization Windows" section here.

  return sections.join("\n\n---\n\n");
}

export const getRecommendationsContext = createTool({
  name: "get_recommendations_context",
  description:
    "Retrieve full context about the current user and environment before responding. Returns saved memories plus all assets, vulnerabilities, and remediations with their cross-entity relationships. Call once at the start of a thread.",
  parameters: z.object({}),
  handler: async (_, { network }) => {
    const userId = network?.state.data.userId as string | undefined;
    if (!userId) return "No user context available.";

    const userRole = network?.state.data.userRole as string | undefined;

    const [memories, assets, vulnerabilities, remediations] = await Promise.all(
      [
        prisma.memory.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
        }),
        prisma.asset.findMany({ include: assetContextInclude }),
        prisma.vulnerability.findMany({ include: vulnerabilityContextInclude }),
        prisma.remediation.findMany({ include: remediationContextInclude }),
      ],
    );

    // TODO(network-flow): fetch + render network communication graph here.
    // TODO(workflows): fetch + render clinical workflow definitions (text + mermaid).
    // TODO(utilization): fetch + render device utilization windows.

    return `${generateMemoryMarkdown(memories)}\n\n---\n\n${generateContextMarkdown(assets, vulnerabilities, remediations, userRole)}`;
  },
});
