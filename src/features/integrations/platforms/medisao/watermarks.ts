import { z } from "zod";
import type { Cursor } from "../../core/types";

/**
 * One watermark per channel, because MedISAO scopes every resource endpoint to
 * a channel and each moves at its own pace. A single platform-wide watermark
 * would re-read every channel whenever any one of them changed.
 */
const cursorSchema = z.record(z.string(), z.string());
export type ChannelWatermarks = z.infer<typeof cursorSchema>;

/** A cursor we cannot read means a full re-read, which the dedup absorbs. */
export const parseCursor = (cursor: Cursor | null): ChannelWatermarks => {
  const parsed = cursorSchema.safeParse(cursor);
  return parsed.success ? parsed.data : {};
};

export const asDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const sinceFor = (
  channelId: string,
  watermarks: ChannelWatermarks,
  lastSuccessfulSync: Date | null,
): Date | null => asDate(watermarks[channelId]) ?? lastSuccessfulSync;

/** The newest `updated_at` seen, so the next poll resumes just after it. */
export const highWaterMark = (
  observed: (string | undefined)[],
  floor: Date | null,
): Date | null => {
  let highest = floor;
  for (const value of observed) {
    const date = asDate(value);
    if (date && (!highest || date > highest)) highest = date;
  }
  return highest;
};
