import "server-only";
import type { ScopeTargetModel } from "@/generated/prisma";
import prisma from "@/lib/db";
import { deviceGroupMatchingLabel } from "@/lib/markdown";

export async function resolveNoteTargetLabel(
  targetModel: ScopeTargetModel,
  instanceId: string,
): Promise<string | null> {
  switch (targetModel) {
    case "ASSET": {
      const asset = await prisma.asset.findUnique({
        where: { id: instanceId },
        select: { hostname: true, ip: true },
      });
      return asset ? (asset.hostname ?? asset.ip) : null;
    }
    case "VULNERABILITY": {
      const vuln = await prisma.vulnerability.findUnique({
        where: { id: instanceId },
        select: { cveId: true },
      });
      return vuln ? (vuln.cveId ?? `Vulnerability ${instanceId}`) : null;
    }
    case "REMEDIATION": {
      const remediation = await prisma.remediation.findUnique({
        where: { id: instanceId },
        select: { description: true },
      });
      if (!remediation) return null;
      const firstSentence = remediation.description?.trim().split("\n")[0];
      return firstSentence ? firstSentence : `Remediation ${instanceId}`;
    }
    case "DEVICE_GROUP_MATCHING": {
      const matching = await prisma.deviceGroupMatching.findUnique({
        where: { id: instanceId },
        select: {
          versionRange: true,
          manufacturer: { select: { canonicalDisplayName: true } },
          product: { select: { canonicalDisplayName: true } },
          version: { select: { canonicalDisplayName: true } },
        },
      });
      return matching ? deviceGroupMatchingLabel(matching) : null;
    }
  }
}
