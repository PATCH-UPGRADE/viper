import { parseAsString, parseAsStringLiteral } from "nuqs/server";
import { createPaginationParams } from "@/lib/url-state";

export const TRACKING_TABS = [
  "suggested",
  "my-department",
  "requires-approval",
  "all",
] as const;

export type TrackingTab = (typeof TRACKING_TABS)[number];

export const trackingParams = {
  ...createPaginationParams(),
  tab: parseAsStringLiteral(TRACKING_TABS)
    .withDefault("suggested")
    .withOptions({ clearOnDefault: true }),
};

export const INTERRUPTION_MODES = ["day", "week", "month"] as const;

export type InterruptionMode = (typeof INTERRUPTION_MODES)[number];

export const interruptionsParams = {
  mode: parseAsStringLiteral(INTERRUPTION_MODES)
    .withDefault("week")
    .withOptions({ clearOnDefault: true }),
  // yyyy-MM-dd; empty means today. A fixed default would go stale in a
  // long-running server, and clearOnDefault needs a constant.
  date: parseAsString.withDefault("").withOptions({ clearOnDefault: true }),
  // Ticket open in the drawer.
  ticket: parseAsString,
};
