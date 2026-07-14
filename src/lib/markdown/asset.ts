// Asset → markdown renderer. Consumed by the chat/recommendations context
// builders. Structurally typed: any Prisma payload with these fields is
// compatible.

import { deviceGroupCpeList, deviceGroupLabel } from "./device-group";
import { type CanonicalRef, renderUtilization, shortId } from "./shared";

/**
 * Human-readable location string from an asset's JSON location value, e.g.
 * "Main Campus / Tower A / Floor 3 / Room 204". Returns "—" when empty
 * or not an object.
 */
export function parseLocation(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "—";
  const loc = raw as {
    facility?: string;
    building?: string;
    floor?: string;
    room?: string;
  };
  return (
    [
      loc.facility,
      loc.building,
      loc.floor ? `Floor ${loc.floor}` : undefined,
      loc.room,
    ]
      .filter(Boolean)
      .join(" / ") || "—"
  );
}

export interface AssetForMarkdown {
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
      `- **Utilization Schedule**: ${renderUtilization(a.utilization) ?? "No data"}`,
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
