import { parseAsStringLiteral } from "nuqs/server";
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
