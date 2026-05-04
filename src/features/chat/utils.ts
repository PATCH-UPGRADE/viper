import type { AssetWithIssueRelations } from "@/features/assets/types";
import type { VulnerabilityWithRelations } from "@/features/vulnerabilities/types";

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

export function buildAssetSystemPrompt(
  asset: AssetWithIssueRelations,
  role: UserRole,
): string {
  const vulnerabilities = asset.issues.map((i) => i.vulnerability);

  const seen = new Set<string>();
  const remediations: (typeof vulnerabilities)[number]["remediations"][number][] =
    [];
  for (const vuln of vulnerabilities) {
    for (const rem of vuln.remediations) {
      if (!seen.has(rem.id)) {
        seen.add(rem.id);
        remediations.push(rem);
      }
    }
  }

  return `You are an AI assistant helping understand asset "${asset.hostname ?? asset.ip}" (ID: ${asset.id}). Help assess vulnerabilities, patch status, and clinical impact for this device.

${ASSET_ROLE_INSTRUCTIONS[role]}

## Asset Data
${JSON.stringify(asset, null, 2)}

## Associated Vulnerabilities
${JSON.stringify(vulnerabilities, null, 2)}

## Remediations
${JSON.stringify(remediations, null, 2)}`;
}

export function buildVulnerabilitySystemPrompt(
  vulnerability: VulnerabilityWithRelations,
  role: UserRole,
): string {
  const assets = vulnerability.issues.map((i) => i.asset);

  return `You are an AI assistant helping understand vulnerability "${vulnerability.cveId ?? vulnerability.id}" (ID: ${vulnerability.id}). Help assess risk, affected assets, and remediation options.

${VULNERABILITY_ROLE_INSTRUCTIONS[role]}

## Vulnerability Data
${JSON.stringify(vulnerability, null, 2)}

## Affected Assets
${JSON.stringify(assets, null, 2)}

## Remediations
${JSON.stringify(vulnerability.remediations, null, 2)}`;
}
