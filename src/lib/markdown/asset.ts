import { assetUtilizationSchema } from "@/features/assets/types";
import { deviceGroupCpeList, deviceGroupLabel } from "./device-group";
import { type CanonicalRef, shortId } from "./shared";

// ─── Utilization rendering ────────────────────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function utilizationBucket(
  value: number,
): "Offline" | "Low" | "Medium" | "High" {
  if (value === 0) return "Offline";
  if (value <= 30) return "Low";
  if (value <= 50) return "Medium";
  return "High";
}

/**
 * Convert asset utilization data into an AI-friendly summary line.
 * Aggregates hourly usage percentages into buckets, then groups consecutive
 * hours of the same bucket into one segment.
 * E.g. "Mon: 9:00–13:00 [High], 13:00–14:00 [Low] | Tue: …".
 *
 * Returns `null` when the input does not parse, so callers can either skip the
 * asset or substitute their own placeholder (e.g. `?? "No data"`).
 */
export function renderUtilization(raw: unknown): string | null {
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

    // Group consecutive hours with the same bucket into one segment.
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
