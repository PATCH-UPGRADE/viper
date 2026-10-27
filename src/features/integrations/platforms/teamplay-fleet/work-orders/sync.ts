import "server-only";
import { ingestPulledWorkOrders } from "@/features/integrations/core/sync/work-order-sources";
import prisma from "@/lib/db";
import type { Cursor, ResourceSyncCtx, SyncOutcome } from "../../../core/types";
import type { FleetConfig, FleetCreds } from "../config";
import {
  type FleetWorkOrderItem,
  listChanged,
  toCanonical,
} from "./activities";
import { FLEET_SOURCE_LABEL } from "./constants";
import { provisionalExternalId } from "./tickets";

/**
 * Point the mappings VIPER minted itself at the ids Fleet gave them.
 *
 * When Fleet accepts an order but returns an unreadable body, the mapping holds
 * a provisional id built from our `ownIncidentNumber`. Fleet echoes that number
 * back on the activity, so the first poll that carries it can swap in the real
 * ticket key. Without this the ingest below finds no mapping for that key and
 * files a second ticket for an order that already exists.
 *
 * One proposal covering N assets sends the same `ownIncidentNumber` on N
 * orders, so the reference alone does not identify an order. The equipment key
 * is what separates them, and it is already part of the provisional id, so the
 * whole id is rebuilt from the activity and matched exactly.
 */
export async function reconcileProvisionalMappings(
  items: FleetWorkOrderItem[],
  integrationId: string,
): Promise<void> {
  const realIdByProvisionalId = new Map<string, string>();
  for (const item of items) {
    if (!item.ownIncidentNumber || !item.equipmentKey) continue;
    realIdByProvisionalId.set(
      provisionalExternalId(item.ownIncidentNumber, item.equipmentKey),
      item.externalId,
    );
  }
  if (realIdByProvisionalId.size === 0) return;

  // Both halves in one query: the provisional rows to rewrite, and any row that
  // already holds one of the real ids.
  const rows = await prisma.externalWorkOrderMapping.findMany({
    where: {
      integrationId,
      externalId: {
        in: [
          ...realIdByProvisionalId.keys(),
          ...realIdByProvisionalId.values(),
        ],
      },
    },
    select: { id: true, externalId: true },
  });

  // `(integrationId, externalId)` is unique, so claiming a key another mapping
  // already holds rejects the write and fails the whole sync.
  const taken = new Set(rows.map((row) => row.externalId));

  for (const row of rows) {
    const realId = realIdByProvisionalId.get(row.externalId);
    if (!realId || taken.has(realId)) continue;

    await prisma.externalWorkOrderMapping.update({
      where: { id: row.id },
      data: { externalId: realId },
    });
    taken.add(realId);
  }
}

export async function syncWorkOrders(
  ctx: ResourceSyncCtx<FleetConfig, FleetCreds>,
): Promise<SyncOutcome> {
  const { session } = ctx;

  // Keyed by externalId so one activity appearing twice in a response is carried
  // once.
  const byExternalId = new Map<string, FleetWorkOrderItem>();
  let cursor: Cursor | null = null;
  for await (const page of listChanged(session, ctx.cursor)) {
    for (const raw of page.items) {
      const item = toCanonical(raw);
      byExternalId.set(item.externalId, item);
    }
    cursor = page.cursor;
  }
  const items = [...byExternalId.values()];

  await reconcileProvisionalMappings(items, ctx.integrationId);
  const response = await ingestPulledWorkOrders(items, {
    integrationId: ctx.integrationId,
    integrationUserId: ctx.integrationUserId,
    sourceLabel: FLEET_SOURCE_LABEL,
  });

  // Throwing makes finalize-sync record Error.
  if (response.shouldRetry) {
    throw new Error(response.message);
  }

  return { cursor };
}
