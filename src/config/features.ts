/**
 * Every feature flag. A flag is off unless VIPER_FEATURES turn it on.
 */
export const FEATURE_KEYS = [
  "chat",
  "reports",
  "workflows",
  "inbox.triage",
  "inbox.mitigation",
  "debrief",
  "auth.emailPassword", // this will be removed in another pr,
  "auth.sso",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type Features = Record<FeatureKey, boolean>;

/** A flag can only be on when the flags it requires are on. */
export const FEATURE_REQUIRES: Partial<
  Record<FeatureKey, readonly FeatureKey[]>
> = {
  reports: ["chat"], // reports use AIChat, chat router and /api/chat
};

/** Flags to block feature/code to user but already implemented */
export const NOT_READY: readonly FeatureKey[] = ["auth.sso"];
