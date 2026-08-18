import type { RollbackLevel } from "@/features/inbox/agent/mitigation/schema";
import type { PlanTagEnum } from "@/generated/prisma";

export const planTagLabels: Record<PlanTagEnum, string> = {
  NETWORK_SEGMENTATION: "Network segmentation",
  DEVICE_UPDATE: "Device update",
  FIRMWARE_UPDATE: "Firmware update",
  VENDOR_FIX: "Vendor fix",
  NEEDS_VENDOR: "Needs vendor",
  CONFIG_CHANGE: "Config change",
  ACCESS_CONTROL: "Access control",
  MONITORING: "Monitoring",
  COMPENSATING_CONTROL: "Compensating control",
  DECOMMISSION: "Decommission",
};

/** The plan cards, in the order they render. */
export const planCardFields = [
  ["effort", "Effort"],
  ["downtime", "Downtime"],
  ["residual_risk", "Residual Risk"],
  ["coverage", "Coverage"],
  ["timeline", "Timeline"],
  ["rollback", "Rollback Ability"],
] as const satisfies ReadonlyArray<readonly [string, string]>;

export type RiskTone = "low" | "medium" | "high" | "unknown";

// Ordered most severe first: "Low now, high if the patch slips" must read as high.
const RISK_PATTERNS: ReadonlyArray<readonly [RiskTone, RegExp]> = [
  ["high", /\b(high|critical|severe)\b/i],
  ["medium", /\b(medium|moderate|elevated)\b/i],
  ["low", /\b(low|minimal|negligible)\b/i],
];

export function residualRiskTone(value: string | undefined): RiskTone {
  const text = value ?? "";
  for (const [tone, pattern] of RISK_PATTERNS) {
    if (pattern.test(text)) return tone;
  }
  return "unknown";
}

export const rollbackToneClass: Record<RollbackLevel, string> = {
  Easy: "text-green-700 dark:text-green-300",
  Moderate: "text-yellow-700 dark:text-yellow-300",
  Hard: "text-red-700 dark:text-red-300",
  Uncertain: "text-muted-foreground",
};

export const riskBannerClass: Record<RiskTone, string> = {
  low: "border-green-500/30 bg-green-500/10 dark:bg-green-500/15",
  medium: "border-yellow-500/30 bg-yellow-500/10 dark:bg-yellow-500/15",
  high: "border-red-500/30 bg-red-500/10 dark:bg-red-500/15",
  unknown: "border-border bg-muted/50",
};

export const riskToneClass: Record<RiskTone, string> = {
  low: "text-green-700 dark:text-green-300",
  medium: "text-yellow-700 dark:text-yellow-300",
  high: "text-red-700 dark:text-red-300",
  unknown: "",
};
