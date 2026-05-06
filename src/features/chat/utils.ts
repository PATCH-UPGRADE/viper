// Client-safe constants and utilities belong in this file.
// Server-only agent config (e.g. DEFAULT_CHAT_MODEL) lives in viper-agent/constants.ts.
import type { Memory } from "@/generated/prisma";

export function generateMemoryMarkdown(memories: Memory[]): string {
  if (memories.length === 0) return "## Memories\n\nNo memories saved yet.";
  return `## Memories\n\n${memories.map((m) => `- [${m.id}] ${m.content}`).join("\n")}`;
}

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
