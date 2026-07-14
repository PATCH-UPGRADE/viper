// Remediation → markdown renderer. Structurally typed so any Prisma payload with
// these fields is compatible.

import { deviceGroupMatchingsSummary } from "./device-group";
import { type CanonicalRef, shortId } from "./shared";

type DeviceGroupMatchingForMarkdown = {
  vendor?: CanonicalRef;
  product?: CanonicalRef;
  version?: CanonicalRef;
  versionRange?: string | null;
};

export interface RemediationForMarkdown {
  id: string;
  description?: string | null;
  narrative?: string | null;
  vulnerabilityId?: string | null;
  vulnerability?: { id: string; cveId?: string | null } | null;
  deviceGroupMatchings?: DeviceGroupMatchingForMarkdown[];
  issueRemediations?: Array<{
    issue: {
      status: string;
      asset: {
        id: string;
        hostname?: string | null;
        ip?: string | null;
      } | null;
    };
  }>;
  artifacts?: Array<{
    latestArtifact?: { artifactType: string } | null;
  }>;
}

export function remediationToMarkdown(r: RemediationForMarkdown): string {
  const cveRef =
    r.vulnerability?.cveId ?? r.vulnerabilityId ?? "no linked vuln";
  const lines = [`### Remediation rem-${shortId(r.id)} → ${cveRef}`];

  const remediationMatchings = r.deviceGroupMatchings ?? [];
  if (remediationMatchings.length > 0) {
    lines.push(
      `- **Affected Products**: ${deviceGroupMatchingsSummary(remediationMatchings)}`,
    );
  }

  if (r.issueRemediations && r.issueRemediations.length > 0) {
    lines.push(`- **Affected Assets** (${r.issueRemediations.length}):`);
    for (const ir of r.issueRemediations) {
      if (!ir.issue.asset) {
        lines.push(`  - device group — issue status: ${ir.issue.status}`);
        continue;
      }
      const label =
        ir.issue.asset.hostname ?? ir.issue.asset.ip ?? ir.issue.asset.id;
      lines.push(
        `  - ${label} (${shortId(ir.issue.asset.id)}) — issue status: ${ir.issue.status}`,
      );
    }
  }

  if (r.description) lines.push(`- **Description**: ${r.description}`);
  if (r.narrative) lines.push(`- **How to Apply**: ${r.narrative}`);

  return lines.join("\n");
}
