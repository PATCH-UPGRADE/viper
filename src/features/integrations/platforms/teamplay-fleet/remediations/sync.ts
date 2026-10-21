import "server-only";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { resolveOrMintVulnerabilities } from "../../medisao/vulnerabilities";
import { releaseScalarData } from "@/features/remediations/release";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { SIEMENS_HEALTHINEERS } from "@/lib/manufacturer-catalog";
import { resolveMatchingId } from "@/lib/router-utils";
import type {
  ResourceSyncCtx,
  SyncOutcome,
} from "@/features/integrations/core/types";
import { fetchAdvisories } from "../advisories/advisories";
import type { FleetConfig, FleetCreds } from "../config";
import { type FleetRemediationItem, toRemediationItem } from "./feed";
import { versionRangeOf } from "./products";

/** Turn every active Fleet security advisory into the remediation it announces */
export async function syncRemediations(
  ctx: ResourceSyncCtx<FleetConfig, FleetCreds>,
): Promise<SyncOutcome> {
  const advisories = await fetchAdvisories(ctx.session);
  const items = advisories
    .filter((a) => a.active !== false)
    .map(toRemediationItem);
  if (items.length === 0) return { cursor: null };

  const { integrationId, integrationUserId } = ctx;
  const outcome = await processIntegrationSync(
    prisma,
    {
      model: prisma.remediation,
      mappingModel: prisma.externalRemediationMapping,
      shouldRecordSyncOutcome: false,
      transformInputItem: async (item: FleetRemediationItem, userId) => {
        const matchingIds: string[] = [];
        for (const p of item.products) {
          matchingIds.push(
            await resolveMatchingId({
              manufacturer: SIEMENS_HEALTHINEERS.canonicalDisplayName,
              product: p.product,
              versionRange: versionRangeOf(p),
            }),
          );
        }
        const vulnerabilityIds = new Set<string>();
        for (const deviceGroupMatchingId of matchingIds) {
          const { ids } = await resolveOrMintVulnerabilities({
            names: item.cveIds,
            integrationId,
            integrationUserId,
            deviceGroupMatchingId,
            context: `Named by templay Fleet advisory ${item.description}.`,
          });
          for (const id of ids.values()) vulnerabilityIds.add(id);
        }
        if (matchingIds.length === 0 && item.cveIds.length > 0) {
          const held = await prisma.vulnerability.findMany({
            where: { cveId: { in: item.cveIds } },
            select: { id: true },
          });
          for (const { id } of held) vulnerabilityIds.add(id);
        }
        const fields = {
          description: item.description,
          narrative: item.narrative,
          isManufacturerRemediation: true,
          ...releaseScalarData(item.release, "stated"),
          deviceGroupMatchings: { connect: matchingIds.map((id) => ({ id })) },
          vulnerabilities: {
            connect: [vulnerabilityIds].map((id) => ({ id })),
          },
        };
        return {
          createData: { ...fields, userId },
          updateData: fields,
          uniqueFieldConditions: [],
          artifactsData: undefined,
        };
      },
    },
    { items },
    integrationUserId,
    integrationId,
    ResourceType.Remediation,
  );

  if (outcome.shouldRetry) {
    throw new Error(`Fleet remediation sync incomplete: ${outcome.message}`);
  }

  return { cursor: null };
}
