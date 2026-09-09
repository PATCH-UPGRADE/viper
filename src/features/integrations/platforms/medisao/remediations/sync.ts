import "server-only";
import { z } from "zod";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { resolveMatchingId } from "@/lib/router-utils";
import type { IntegrationResponse } from "@/lib/schemas";
import type { Cursor, ResourceSyncCtx, SyncOutcome } from "../../../core/types";
import { listChannels } from "../channels";
import type { MedIsaoConfig, MedIsaoCreds } from "../config";
import { MedIsaoRequestError } from "../paginate";
import { createMedIsaoSession } from "../session";
import { listChanged, type MedIsaoRemediationItem } from "./feed";

/**
 * One watermark per channel, because MedISAO scopes every remediation endpoint
 * to a channel and each moves at its own pace. A single platform-wide watermark
 * would re-read every channel whenever any one of them changed.
 */
const cursorSchema = z.record(z.string(), z.string());
type ChannelWatermarks = z.infer<typeof cursorSchema>;

/** A cursor we cannot read means a full re-read, which the mapping upsert absorbs. */
const parseCursor = (cursor: Cursor | null): ChannelWatermarks => {
  const parsed = cursorSchema.safeParse(cursor);
  return parsed.success ? parsed.data : {};
};

const asDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const sinceFor = (
  channelId: string,
  watermarks: ChannelWatermarks,
  lastSuccessfulSync: Date | null,
): Date | null => asDate(watermarks[channelId]) ?? lastSuccessfulSync;

/**
 * MedISAO names a vulnerability by identifier, not by our id, and the array is
 * not CVE-only: GHSA and vendor identifiers appear too. Resolve against what we
 * already hold and never mint a Vulnerability here, because advisories are
 * where vulnerabilities enter the system.
 */
async function resolveVulnerabilityIds(
  items: MedIsaoRemediationItem[],
): Promise<Map<string, string>> {
  const names = [
    ...new Set(items.flatMap((item) => item.fixedVulnerabilities)),
  ];
  if (names.length === 0) return new Map();

  const rows = await prisma.vulnerability.findMany({
    where: { cveId: { in: names } },
    select: { id: true, cveId: true },
  });
  return new Map(
    rows.flatMap((row) => (row.cveId ? [[row.cveId, row.id] as const] : [])),
  );
}

async function ingestRemediations(
  items: MedIsaoRemediationItem[],
  integrationId: string,
): Promise<IntegrationResponse> {
  const { integrationUserId } = await prisma.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { integrationUserId: true },
  });

  const vulnerabilityIdByName = await resolveVulnerabilityIds(items);

  // Items from one channel share a manufacturer and product, so the same
  // identity resolves many times over a sync. Each miss is several round trips.
  const matchingIdCache = new Map<string, string>();

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

        // Viper holds one vulnerability per remediation, MedISAO lists many.
        // Link only when the answer is unambiguous.
        const resolved = [
          ...new Set(
            item.fixedVulnerabilities
              .map((name) => vulnerabilityIdByName.get(name))
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        const vulnerabilityId = resolved.length === 1 ? resolved[0] : null;

        const fields = {
          description: item.description,
          narrative: item.narrative,
          sourceImpact: item.sourceImpact,
          ...(vulnerabilityId ? { vulnerabilityId } : {}),
        };

        return {
          createData: {
            ...fields,
            userId,
            deviceGroupMatchings: { connect: [{ id: matchingId }] },
          },
          // Never reassign the creator on re-sync. `connect` is idempotent, so
          // a matching already attached stays attached exactly once.
          updateData: {
            ...fields,
            deviceGroupMatchings: { connect: [{ id: matchingId }] },
          },
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
  const session = createMedIsaoSession(ctx.creds);
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
