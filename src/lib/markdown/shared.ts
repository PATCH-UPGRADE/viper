// Shared primitives for the db-item → markdown renderers. One home for the
// helpers that were previously duplicated across the chat and recommendations
// context builders (shortId, truncate, utilization rendering).

import { assetUtilizationSchema } from "@/features/assets/types";

/** A canonical (vendor/product/version) reference as selected for rendering. */
export type CanonicalRef = { canonicalDisplayName: string } | null | undefined;

/** First 8 chars of an id, for compact human-facing references. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Truncate free text to `max` chars, appending an ellipsis when clipped. */
export function truncate(text: string | null | undefined, max = 400): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ─── Utilization rendering ────────────────────────────────────────────────────

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function utilizationBucket(
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
