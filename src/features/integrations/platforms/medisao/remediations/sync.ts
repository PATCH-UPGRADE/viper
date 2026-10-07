import "server-only";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { resolveMatchingId } from "@/lib/router-utils";
import type { IntegrationResponse } from "@/lib/schemas";
import type { ResourceSyncCtx, SyncOutcome } from "../../../core/types";
import { listChannels } from "../channels";
import type { MedIsaoConfig, MedIsaoCreds } from "../config";
import { MedIsaoRequestError } from "../paginate";
import {
  normalizeIdentifier,
  resolveOrMintVulnerabilities,
} from "../vulnerabilities";
import {
  asDate,
  type ChannelWatermarks,
  parseCursor,
  sinceFor,
} from "../watermarks";
import { listChanged, type MedIsaoRemediationItem } from "./feed";

/**
 * The description we store, with every vulnerability the remediation claims to
 * fix named in it.
 *
 * The sync stores no raw payload, so this text is the only record of what
 * MedISAO sent. It stays readable and searchable even if a user unlinks a
 * vulnerability from the row.
 *
 * Built from the feed alone, so a re-sync produces the same text and does not
 * churn the row.
 */
export const describeRemediation = (
  item: Pick<MedIsaoRemediationItem, "description" | "fixedVulnerabilities">,
): string | null => {
  if (item.fixedVulnerabilities.length === 0) return item.description;

  const fixes = `Fixes: ${item.fixedVulnerabilities.join(", ")}`;
  return item.description ? `${item.description}\n\n${fixes}` : fixes;
};

async function ingestRemediations(
  items: MedIsaoRemediationItem[],
  integrationId: string,
): Promise<IntegrationResponse> {
  const { integrationUserId } = await prisma.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { integrationUserId: true },
  });

  // Items from one channel share a manufacturer and product, so the same
  // identity resolves many times over a sync. Each miss is several round trips.
  const matchingIdCache = new Map<string, string>();
  // The same holds for the vulnerabilities those items name, keyed by matching
  // because a row minted for one channel must still be attached to the next.
  const vulnerabilityIdCache = new Map<string, string>();

  return processIntegrationSync(
    prisma,
    {
      model: prisma.remediation,
      mappingModel: prisma.externalRemediationMapping,
      // finalize-sync already records this attempt; a second write double-counts
      // consecutiveFailures.
      shouldRecordSyncOutcome: false,
      transformInputItem: async (item: MedIsaoRemediationItem, userId) => {
        // JSON rather than a joined string: every part is free text, so any
        // separator can appear inside one and let two different identities
        // collide on one cache entry.
        const identity = JSON.stringify([
          item.manufacturer,
          item.product ?? "",
          item.version ?? "",
          item.versionRange ?? "",
        ]);

        let matchingId = matchingIdCache.get(identity);
        if (!matchingId) {
          matchingId = await resolveMatchingId({
            manufacturer: item.manufacturer,
            product: item.product,
            version: item.version,
            versionRange: item.versionRange,
            // Nothing here came from a CPE; the channel is the identity.
            hasCpe: false,
          });
          matchingIdCache.set(identity, matchingId);
        }

        const cacheKey = (name: string) =>
          JSON.stringify([matchingId, normalizeIdentifier(name)]);
        const { ids } = await resolveOrMintVulnerabilities({
          names: item.fixedVulnerabilities.filter(
            (name) => !vulnerabilityIdCache.has(cacheKey(name)),
          ),
          integrationId,
          integrationUserId,
          deviceGroupMatchingId: matchingId,
          context: `Named by MedISAO as fixed by remediation ${item.externalId}. No CVE is assigned.`,
        });
        for (const [name, id] of ids) {
          vulnerabilityIdCache.set(cacheKey(name), id);
        }
        const vulnerabilities = [
          ...new Set(
            item.fixedVulnerabilities.flatMap(
              (name) => vulnerabilityIdCache.get(cacheKey(name)) ?? [],
            ),
          ),
        ].map((id) => ({ id }));

        const fields = {
          description: describeRemediation(item),
          narrative: item.narrative,
          sourceImpact: item.sourceImpact,
          // `connect` is idempotent, so on re-sync a matching or vulnerability
          // already attached stays attached exactly once, and a link a user
          // added survives.
          deviceGroupMatchings: { connect: [{ id: matchingId }] },
          vulnerabilities: { connect: vulnerabilities },
        };

        return {
          createData: { ...fields, userId },
          // Never reassign the creator on re-sync.
          updateData: fields,
          // A remediation has no natural business key, so with no external
          // mapping there is nothing to match on and the record is new.
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
}

/**
 * Walk every channel this key can see and ingest the remediations that moved.
 *
 * Subscription is deliberately not consulted. MedISAO serves advisories and
 * remediations under open discovery, so a subscription is bookkeeping only and
 * a channel we never subscribed to still answers.
 */
export async function syncRemediations(
  ctx: ResourceSyncCtx<MedIsaoConfig, MedIsaoCreds>,
): Promise<SyncOutcome> {
  const { session } = ctx;
  const { apiUrl } = ctx.config;

  const watermarks = parseCursor(ctx.cursor);
  const nextWatermarks: ChannelWatermarks = { ...watermarks };
  const items: MedIsaoRemediationItem[] = [];

  for (const channel of await listChannels(session, apiUrl)) {
    const since = sinceFor(channel.id, watermarks, ctx.lastSuccessfulSync);
    let highest = since;

    try {
      for await (const page of listChanged(
        session,
        apiUrl,
        channel.id,
        since,
      )) {
        for (const item of page) {
          items.push(item);
          const observed = asDate(item.updatedAt);
          if (observed && (!highest || observed > highest)) highest = observed;
        }
      }
    } catch (error) {
      // A manufacturer can unpublish a channel or opt a device out between the
      // channel listing and this read. That is a 404 and it is not a fault.
      if (error instanceof MedIsaoRequestError && error.status === 404) {
        console.warn(`MedISAO channel ${channel.id} is no longer visible.`);
        continue;
      }
      throw error;
    }

    if (highest) nextWatermarks[channel.id] = highest.toISOString();
  }

  // Advance the watermarks only behind a clean ingest.
  //
  // A throw leaves the stored cursor alone by itself, but a partial failure
  // does not throw: `processIntegrationSync` collects per-item errors and
  // reports `shouldRetry` instead. Advancing past those items would drop them
  // for good, so the whole window is re-read next time. Re-reading is free,
  // because every write behind this is an upsert keyed on the external id.
  if (items.length > 0) {
    const outcome = await ingestRemediations(items, ctx.integrationId);
    if (outcome.shouldRetry) {
      console.warn(`MedISAO remediation ingest incomplete: ${outcome.message}`);
      return { cursor: watermarks };
    }
  }

  return { cursor: nextWatermarks };
}
