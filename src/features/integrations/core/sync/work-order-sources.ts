import "server-only";
import { TRPCError } from "@trpc/server";
import {
  type Prisma,
  ResourceType,
  type TicketCategory,
  type TicketStatus,
} from "@/generated/prisma";
import prisma, { type TransactionClient } from "@/lib/db";
import type { IntegrationOrigin } from "@/lib/provenance/types";
import { deleteWithObservation } from "@/lib/provenance/write";
import type { IntegrationResponse } from "@/lib/schemas";
import {
  integrationOrigin,
  processIntegrationSync,
  type SyncRun,
} from "./upsert";

/** A work order pulled from a platform, mapped onto the ticket fields. */
export interface PulledWorkOrder {
  externalId: string;
  /** The exact payload. */
  raw: Prisma.InputJsonValue;
  summary: string;
  body: string;
  status: TicketStatus;
  /**
   * Leave it out if VIPER owns the category. A new ticket then gets the column
   * default, and a re-sync keeps the category that a user chose.
   */
  category?: TicketCategory;
  scheduledAt: string | null;
  scheduledEndTime: string | null;
}

/**
 * Upsert pulled work orders as tickets.
 *
 * For a repeated `externalId`, only the last item is ingested.
 */
export function ingestPulledWorkOrders(
  allItems: PulledWorkOrder[],
  { sourceLabel, ...run }: SyncRun & { sourceLabel: string },
): Promise<IntegrationResponse> {
  const items = [
    ...new Map(allItems.map((item) => [item.externalId, item])).values(),
  ];

  return processIntegrationSync(
    {
      entityType: "WORK_ORDER",
      // finalize-sync already records this attempt. A second write
      // double-counts consecutiveFailures.
      shouldRecordSyncOutcome: false,
      transformInputItem: async (item: PulledWorkOrder) => {
        const fields = {
          summary: item.summary,
          body: item.body,
          status: item.status,
          category: item.category,
          scheduledAt: item.scheduledAt ? new Date(item.scheduledAt) : null,
          scheduledEndTime: item.scheduledEndTime
            ? new Date(item.scheduledEndTime)
            : null,
          sourceLabel,
        };
        return {
          create: { fields },
          update: { fields },
          raw: item.raw,
          // A work order has no natural business key, so with no external
          // mapping there is nothing to match on and the ticket is new.
          uniqueFieldConditions: [],
        };
      },
    },
    { items },
    run,
    ResourceType.WorkOrder,
  );
}

/** The subset of `externalIds` that this integration has a ticket for. */
export async function listMappedWorkOrders(
  integrationId: string,
  externalIds: string[],
): Promise<string[]> {
  if (externalIds.length === 0) return [];
  const mappings = await prisma.externalWorkOrderMapping.findMany({
    where: { integrationId, externalId: { in: externalIds } },
    select: { externalId: true },
  });
  return mappings.map((mapping) => mapping.externalId);
}

// Deleting a ticket takes about six sequential queries, and a ticket can have
// any number of asset sub-tickets.
const DELETE_TIMEOUT_MS = 5_000;
const DELETE_TIMEOUT_PER_SUB_TICKET_MS = 300;

/**
 * Delete the tickets of records that the platform deleted.
 *
 * An asset sub-ticket has no meaning without its parent, so it is deleted too.
 * An attached sub-ticket is independent and can have a live record of its own,
 * so it stays with no parent, whether its parent is the deleted ticket or one of
 * that ticket's asset sub-tickets.
 */
export async function deletePulledWorkOrders(
  run: SyncRun,
  externalIds: string[],
): Promise<void> {
  if (externalIds.length === 0) return;
  const mappings = await prisma.externalWorkOrderMapping.findMany({
    where: {
      integrationId: run.integrationId,
      externalId: { in: externalIds },
    },
    select: { itemId: true },
  });
  const origin = await integrationOrigin(run);
  for (const { itemId } of mappings) {
    const subTicketCount = await prisma.assetTicket.count({
      where: { parentTicketId: itemId },
    });
    await prisma.$transaction(
      (tx) =>
        deleteTicket(tx, itemId, origin, async () => {
          // The ticket is locked, so it can't get another asset in between.
          const subTickets = await tx.workOrderTicket.findMany({
            where: { ticket: { parentTicketId: itemId } },
            select: { id: true },
          });
          for (const { id } of subTickets) await deleteTicket(tx, id, origin);
        }),
      {
        timeout:
          DELETE_TIMEOUT_MS + subTicketCount * DELETE_TIMEOUT_PER_SUB_TICKET_MS,
      },
    );
  }
}

/** Deletes a ticket with its TOMBSTONE, or does nothing if it is already gone. */
async function deleteTicket(
  tx: TransactionClient,
  id: string,
  origin: IntegrationOrigin,
  beforeDelete?: () => Promise<void>,
): Promise<void> {
  // It throws NOT_FOUND before it writes anything, so the transaction can go on.
  try {
    await deleteWithObservation(
      tx,
      { entityType: "WORK_ORDER", entityId: id, origin },
      async (raw) => {
        await beforeDelete?.();
        await raw.workOrderTicket.delete({ where: { id } });
      },
    );
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") return;
    throw error;
  }
}
