import "server-only";
import { TicketStatus } from "@/generated/prisma";
import type { TransactionClient } from "@/lib/db";
import { recordAssetActivity } from "./activities";

/**
 * Attach one asset to a ticket: creates a dedicated child ticket for that
 * asset plus the AssetTicket join row linking it back to the parent. Every
 * asset attachment goes through this, uniformly — there is no "just connect
 * the asset" path anymore, and no special-casing a ticket's first vs. Nth
 * asset. The child also gets `parent: { connect }` set (not just the
 * AssetTicket join) so the general list view rolls it up and cascade-deletes
 * with the parent, via the pre-existing parentId/children self-relation.
 */
export async function createAssetTicket(
  tx: TransactionClient,
  params: { parentTicketId: string; assetId: string; actorId: string },
): Promise<{ assetTicketId: string; childTicketId: string }> {
  const { parentTicketId, assetId, actorId } = params;

  const [parent, asset] = await Promise.all([
    tx.workOrderTicket.findUniqueOrThrow({
      where: { id: parentTicketId },
      select: {
        summary: true,
        body: true,
        category: true,
        priority: true,
        creatorId: true,
        scheduledAt: true,
        sourceLabel: true,
      },
    }),
    tx.asset.findUniqueOrThrow({
      where: { id: assetId },
      select: { hostname: true, ip: true },
    }),
  ]);

  const child = await tx.workOrderTicket.create({
    data: {
      summary: `${parent.summary} — ${asset.hostname ?? asset.ip}`,
      body: parent.body,
      category: parent.category,
      priority: parent.priority,
      status: TicketStatus.TO_DO,
      scheduledAt: parent.scheduledAt,
      sourceLabel: parent.sourceLabel,
      creator: { connect: { id: parent.creatorId } },
      parent: { connect: { id: parentTicketId } },
    },
    select: { id: true },
  });

  const assetTicket = await tx.assetTicket.create({
    data: { assetId, parentTicketId, ticketId: child.id },
    select: { id: true },
  });

  await recordAssetActivity(tx, parentTicketId, actorId, assetId, "attached");

  return { assetTicketId: assetTicket.id, childTicketId: child.id };
}
