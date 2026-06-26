import { assetUtilizationSchema } from "@/features/assets/types";
import {
  deviceGroupCpeList,
  deviceGroupLabel,
  deviceGroupMatchingsSummary,
  parseLocation,
} from "@/lib/string-utils";

// ─── Structural interfaces for markdown rendering ─────────────────────────────
// Any Prisma payload that includes these fields is compatible (structural typing).

type CanonicalRef = { canonicalDisplayName: string } | null | undefined;

type DeviceGroupMatchingForMarkdown = {
  vendor?: CanonicalRef;
  product?: CanonicalRef;
  version?: CanonicalRef;
  versionRange?: string | null;
};

interface AssetForMarkdown {
  id: string;
  hostname?: string | null;
  ip?: string | null;
  macAddress?: string | null;
  role?: string | null;
  status?: string | null;
  networkSegment?: string | null;
  serialNumber?: string | null;
  location?: unknown;
  utilization?: unknown;
  updatedAt?: Date;
  deviceGroup: {
    vendor?: CanonicalRef;
    product?: CanonicalRef;
    version?: CanonicalRef;
    cpe?: string[];
  };
  issues?: Array<{
    status: string;
    vulnerability: {
      id: string;
      cveId?: string | null;
      severity: string;
      priority?: string;
    };
  }>;
}

interface VulnerabilityForMarkdown {
  id: string;
  cveId?: string | null;
  severity: string;
  priority?: string;
  cvssScore?: number | null;
  cvssVector?: string | null;
  epss?: number | null;
  inKEV?: boolean;
  exploitUri?: string | null;
  affectedComponents?: string[];
  description?: string | null;
  narrative?: string | null;
  impact?: string | null;
  deviceGroupMatchings?: DeviceGroupMatchingForMarkdown[];
  remediations?: Array<{ id: string; description?: string | null }>;
  issues?: Array<{
    status: string;
    asset: { id: string; hostname?: string | null; ip?: string | null };
  }>;
}

interface RemediationForMarkdown {
  id: string;
  description?: string | null;
  narrative?: string | null;
  vulnerabilityId?: string | null;
  vulnerability?: { id: string; cveId?: string | null } | null;
  deviceGroupMatchings?: DeviceGroupMatchingForMarkdown[];
  issueRemediations?: Array<{
    issue: {
      status: string;
      asset: { id: string; hostname?: string | null; ip?: string | null };
    };
  }>;
  artifacts?: Array<{
    latestArtifact?: { artifactType: string } | null;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UTILIZATION_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function utilizationBucket(
  value: number,
): "Offline" | "Low" | "Medium" | "High" {
  if (value === 0) return "Offline";
  if (value <= 30) return "Low";
  if (value <= 50) return "Medium";
  return "High";
}

// Convert asset utilization data into more AI-friendly format
// Aggregate usage percentages into buckets, then group consecutive hours
// of the same bucket into one line.
// E.g, "9:00-13:00 [High], 13:00-14:00 [Low]", etc
function renderUtilizationLine(raw: unknown): string {
  const parsed = assetUtilizationSchema.safeParse(raw);
  if (!parsed.success) return "No data";
  const data = parsed.data;

  const parts: string[] = [];
  for (let dayIdx = 0; dayIdx < data.length; dayIdx++) {
    const dayData = data[dayIdx];
    const dayName = UTILIZATION_DAY_NAMES[dayIdx] ?? `Day${dayIdx}`;
    const hours = Array.from({ length: 24 }, (_, h) => h);

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

function truncate(text: string | null | undefined, max = 400): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

// ─── Individual entity renderers ──────────────────────────────────────────────

export function assetToMarkdown(
  a: AssetForMarkdown,
  opts: { includeIssues?: boolean } = { includeIssues: true },
): string {
  const label = a.hostname ?? a.ip ?? a.id;
  const lines = [
    `### ${label} (${shortId(a.id)})`,
    `- **IP**: ${a.ip ?? "N/A"}`,
    `- **MAC Address**: ${a.macAddress ?? "N/A"}`,
    `- **Role**: ${a.role ?? "Unknown"}`,
    `- **Status**: ${a.status ?? "Unknown"}`,
    `- **Serial Number**: ${a.serialNumber ?? "N/A"}`,
    `- **Location**: ${parseLocation(a.location)}`,
    `- **Device Group**: ${deviceGroupLabel(a.deviceGroup)}${a.deviceGroup.cpe?.length ? ` (CPE: ${deviceGroupCpeList(a.deviceGroup)})` : ""}`.trim(),
    `- **Device Group Version**: ${a.deviceGroup.version?.canonicalDisplayName ?? "N/A"}`,
  ];

  if (a.utilization) {
    lines.push(
      `- **Utilization Schedule**: ${renderUtilizationLine(a.utilization)}`,
    );
  }

  if (opts.includeIssues && a.issues && a.issues.length > 0) {
    const active = a.issues.filter((i) => i.status === "ACTIVE");
    lines.push(
      `- **Active Issues** (${active.length} of ${a.issues.length} total)`,
    );
    for (const issue of a.issues) {
      const v = issue.vulnerability;
      lines.push(
        `  - ${v.cveId ?? v.id}${v.priority ? ` [priority: ${v.priority}]` : ""} — severity: ${v.severity}, status: ${issue.status}`,
      );
    }
  } else if (opts.includeIssues) {
    lines.push("- **Active Issues**: None");
  }

  return lines.join("\n");
}

export function vulnerabilityToMarkdown(
  v: VulnerabilityForMarkdown,
  opts: { includeAssets?: boolean; includeRemediations?: boolean } = {
    includeAssets: true,
    includeRemediations: true,
  },
): string {
  const lines = [
    `### ${v.cveId ?? v.id} — ${v.severity}${v.priority ? `, priority: ${v.priority}` : ""}`,
    `- **CVSS Score**: ${v.cvssScore ?? "N/A"}`,
    `- **CVSS Vector**: ${v.cvssVector ?? "N/A"}`,
    `- **EPSS**: ${v.epss != null ? `${(v.epss * 100).toFixed(2)}%` : "N/A"}`,
    `- **In CISA KEV**: ${v.inKEV ? "Yes" : "No"}`,
  ];

  if (v.affectedComponents && v.affectedComponents.length > 0) {
    lines.push(`- **Affected Components**: ${v.affectedComponents.join(", ")}`);
  }

  if (v.deviceGroupMatchings && v.deviceGroupMatchings.length > 0) {
    lines.push(
      `- **Affected Products**: ${deviceGroupMatchingsSummary(v.deviceGroupMatchings)}`,
    );
  }

  if (v.description) lines.push(`- **Description**: ${v.description}`);
  if (v.narrative) lines.push(`- **Exploit Narrative**: ${v.narrative}`);
  if (v.impact) lines.push(`- **Clinical Impact**: ${v.impact}`);

  if (opts.includeAssets && v.issues && v.issues.length > 0) {
    lines.push(`- **Affected Assets** (${v.issues.length}):`);
    for (const issue of v.issues) {
      const label = issue.asset.hostname ?? issue.asset.ip ?? issue.asset.id;
      lines.push(
        `  - ${label} (${shortId(issue.asset.id)}) — issue status: ${issue.status}`,
      );
    }
  }

  if (opts.includeRemediations && v.remediations && v.remediations.length > 0) {
    lines.push(`- **Available Remediations** (${v.remediations.length}):`);
    for (const r of v.remediations) {
      const desc = r.description ? ` — ${truncate(r.description, 80)}` : "";
      lines.push(`  - rem-${shortId(r.id)}${desc}`);
    }
  }

  return lines.join("\n");
}

export function remediationToMarkdown(r: RemediationForMarkdown): string {
  const cveRef =
    r.vulnerability?.cveId ?? r.vulnerabilityId ?? "no linked vuln";
  const lines = [`### Remediation rem-${shortId(r.id)} → ${cveRef}`];

  const remediationMatchings = r.deviceGroupMatchings ?? [];
  if (remediationMatchings.length > 0) {
    lines.push(
      `- **Affected Products**: ${deviceGroupMatchingsSummary(remediationMatchings)}`,
    );
  }

  if (r.issueRemediations && r.issueRemediations.length > 0) {
    lines.push(`- **Affected Assets** (${r.issueRemediations.length}):`);
    for (const ir of r.issueRemediations) {
      const label =
        ir.issue.asset.hostname ?? ir.issue.asset.ip ?? ir.issue.asset.id;
      lines.push(
        `  - ${label} (${shortId(ir.issue.asset.id)}) — issue status: ${ir.issue.status}`,
      );
    }
  }

  if (r.description) lines.push(`- **Description**: ${r.description}`);
  if (r.narrative) lines.push(`- **How to Apply**: ${r.narrative}`);

  return lines.join("\n");
}

// ─── Memory rendering ─────────────────────────────────────────────────────────

export function generateMemoryMarkdown(
  memories: { id: string; content: string | null }[],
): string {
  if (memories.length === 0) return "## Memories\n\n_No memories saved yet._";
  return `## Memories\n\n${memories.map((m) => `- [${m.id}] ${m.content ?? ""}`).join("\n")}`;
}

// ─── User roles and per-role instructions ─────────────────────────────────────

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

export const RECOMMENDATION_ROLE_INSTRUCTIONS: Record<UserRole, string> = {
  CISO: "Structure your recommendation as an executive briefing: lead with risk reduction impact (e.g., '↓ 46% exposure'), highlight compliance implications, and frame patch windows as business decisions. Keep clinical details brief unless asked.",
  "Clinical Staff":
    "Lead with clinical impact: which devices affect which care workflows, what patient risk exists if not patched, and what manual workarounds nursing/clinical staff would need to manage during downtime. Avoid acronyms and technical jargon.",
  "IT staff":
    "Be technical and actionable: include network segment, patch command or procedure, expected downtime duration, rollback steps, and post-patch connectivity checks. Use precise language and reference CVE IDs explicitly.",
  "hospital administration":
    "Frame recommendations in operational and financial terms: downtime cost, regulatory exposure, departmental impact, and scheduling options. Provide a clear go/no-go summary per item.",
  "biomedical engineer":
    "Focus on the device layer: firmware version, manufacturer patch advisory, device certification impact, required post-patch biomedical validation steps, and any interoperability risks with connected systems. Reference device model and CPE.",
};
