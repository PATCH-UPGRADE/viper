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

/** The five plan cards, in the order they render. */
export const planCardFields = [
  ["effort", "Effort"],
  ["downtime", "Downtime"],
  ["residual_risk", "Residual Risk"],
  ["coverage", "Coverage"],
  ["timeline", "Timeline"],
] as const satisfies ReadonlyArray<readonly [string, string]>;
