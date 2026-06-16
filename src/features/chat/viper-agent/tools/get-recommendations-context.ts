import { assetUtilizationSchema } from "@/features/assets/types";
import {
  type NetworkTopology,
  networkTopologySchema,
} from "@/features/network/types";
import { serializeWorkflow } from "@/features/workflows/utils";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  assetToMarkdown,
  generateMemoryMarkdown,
  remediationToMarkdown,
  vulnerabilityToMarkdown,
} from "../../utils";

const NETWORK_FLOW_URL = process.env.NETWORK_FLOW_URL;
const NETWORK_FLOW_TOKEN = process.env.NETWORK_FLOW_TOKEN;
const NETWORK_FLOW_TIMEOUT = 15 * 1000;

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

// ─── Utilization helpers ──────────────────────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function utilizationBucket(
  value: number,
): "Offline" | "Low" | "Medium" | "High" {
  if (value === 0) return "Offline";
  if (value <= 30) return "Low";
  if (value <= 50) return "Medium";
  return "High";
}

function renderUtilizationBuckets(raw: unknown): string | null {
  const parsed = assetUtilizationSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;

  const parts: string[] = [];
  for (let dayIdx = 0; dayIdx < data.length; dayIdx++) {
    const dayData = data[dayIdx];
    const dayName = DAY_NAMES[dayIdx] ?? `Day${dayIdx}`;
    const hours = Object.keys(dayData)
      .map(Number)
      .sort((a, b) => a - b);

    if (hours.length === 0) {
      parts.push(`${dayName}: Offline`);
      continue;
    }

    // Group consecutive hours with the same bucket
    const segments: { bucket: string; start: number; end: number }[] = [];
    for (const hour of hours) {
      const bucket = utilizationBucket(dayData[String(hour)] ?? 0);
      const last = segments[segments.length - 1];
      if (last && last.bucket === bucket && last.end === hour - 1) {
        last.end = hour;
      } else {
        segments.push({ bucket, start: hour, end: hour });
      }
    }

    const segStrs = segments.map(({ bucket, start, end }) => {
      const range = start === end ? `${start}:00` : `${start}:00–${end + 1}:00`;
      return `${range} [${bucket}]`;
    });
    parts.push(`${dayName}: ${segStrs.join(", ")}`);
  }

  return parts.join(" | ");
}

// ─── Workflow markdown ────────────────────────────────────────────────────────

type WorkflowWithRelations = Prisma.WorkflowGetPayload<{
  include: { nodes: true; connections: true };
}>;

function generateWorkflowsMarkdown(workflows: WorkflowWithRelations[]): string {
  if (workflows.length === 0) return "_No clinical workflows defined._";

  return workflows
    .map((wf) => {
      const serialized = serializeWorkflow(wf);
      const { edges: _edges, ...withoutEdges } = serialized;
      const lines = [`### ${serialized.name} (${shortId(serialized.id)})`];
      if (serialized.description) {
        lines.push(`\n${serialized.description}`);
      }
      lines.push(
        `\n\`\`\`json\n${JSON.stringify(withoutEdges, null, 2)}\n\`\`\``,
      );
      return lines.join("\n");
    })
    .join("\n\n");
}

// ─── Network flow ─────────────────────────────────────────────────────────────

async function fetchNetworkTopologyForContext(): Promise<NetworkTopology | null> {
  if (!NETWORK_FLOW_URL) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_FLOW_TIMEOUT);

  try {
    const res = await fetch(NETWORK_FLOW_URL, {
      headers: {
        ...(NETWORK_FLOW_TOKEN
          ? { Authorization: `Bearer ${NETWORK_FLOW_TOKEN}` }
          : {}),
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const json = await res.json();
    return networkTopologySchema.parse(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function generateNetworkFlowMarkdown(topology: NetworkTopology | null): string {
  if (!topology) {
    return "_Network flow data unavailable (NETWORK_FLOW_URL not configured or fetch failed)._";
  }

  const lines: string[] = [];

  lines.push(`**Snapshot**: ${topology.snapshot_id} at ${topology.timestamp}`);
  lines.push("");
  lines.push("**Assets**:");
  for (const asset of topology.assets) {
    const ips = asset.interfaces
      .map((iface) => iface.ipv4_address ?? iface.ipv6_address ?? iface.id)
      .filter(Boolean)
      .join(", ");
    const services =
      asset.services && asset.services.length > 0
        ? asset.services.map((s) => `${s.port}/${s.protocol}`).join(", ")
        : "none";
    lines.push(
      `- \`${asset.id}\` — manufacturer: ${asset.manufacturer ?? "unknown"} | IPs: ${ips || "none"} | services: ${services}`,
    );
  }

  const connections = topology.connections ?? [];
  if (connections.length > 0) {
    lines.push("");
    lines.push("**Connections**:");
    for (const conn of connections) {
      lines.push(
        `- \`${conn.src_asset_id}\` → \`${conn.dst_asset_id}\` | port ${conn.dst_port}/${conn.protocol} | ${conn.direction}`,
      );
    }
  } else {
    lines.push("");
    lines.push("**Connections**: none observed");
  }

  return lines.join("\n");
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
  workflows: WorkflowWithRelations[],
  networkTopology: NetworkTopology | null,
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

  sections.push(
    `## Clinical Workflows\n\n${generateWorkflowsMarkdown(workflows)}`,
  );

  sections.push(
    `## Network Flow\n\n${generateNetworkFlowMarkdown(networkTopology)}`,
  );

  // Device utilization: only include assets that have utilization data
  const utilizationLines: string[] = [];
  for (const asset of assets) {
    const rendered = renderUtilizationBuckets(asset.utilization);
    if (rendered) {
      const label = asset.hostname ?? asset.ip ?? shortId(asset.id);
      utilizationLines.push(
        `- **${label} (${shortId(asset.id)})**: ${rendered}`,
      );
    }
  }

  const utilizationSection =
    utilizationLines.length === 0
      ? "_No device utilization data available._"
      : [
          "Bucket thresholds: Offline = 0% | Low = 1–30% | Medium = 31–50% | High = 51–100%",
          "",
          ...utilizationLines,
        ].join("\n");

  sections.push(`## Device Utilization Windows\n\n${utilizationSection}`);

  return sections.join("\n\n---\n\n");
}

/**
 * Loads the full recommendations context (memories + assets + vulns +
 * remediations + workflows + network flow + utilization) as markdown.
 * The recommendations graph preloads this deterministically (not as a model
 * tool call).
 */
export async function loadRecommendationsContextMarkdown(
  userId: string,
  userRole?: string,
): Promise<string> {
  const [
    memories,
    assets,
    vulnerabilities,
    remediations,
    workflows,
    networkTopology,
  ] = await Promise.all([
    prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.asset.findMany({ include: assetContextInclude }),
    prisma.vulnerability.findMany({ include: vulnerabilityContextInclude }),
    prisma.remediation.findMany({ include: remediationContextInclude }),
    prisma.workflow.findMany({ include: { nodes: true, connections: true } }),
    fetchNetworkTopologyForContext(),
  ]);

  return `${generateMemoryMarkdown(memories)}\n\n---\n\n${generateContextMarkdown(assets, vulnerabilities, remediations, workflows, networkTopology, userRole)}`;
}
