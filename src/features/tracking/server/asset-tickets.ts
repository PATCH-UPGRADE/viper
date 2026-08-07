import "server-only";
import { TicketStatus } from "@/generated/prisma";
import type { TransactionClient } from "@/lib/db";
import { recordAssetActivity } from "./activities";

export async function createAssetTicket(
  tx: TransactionClient,
  params: { parentTicketId: string; assetId: string; actorId: string },
): Promise<string> {
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
      ticket: { create: { assetId, parentTicketId } },
    },
    select: { id: true },
  });

  await recordAssetActivity(
    tx,
    parentTicketId,
    actorId,
    assetId,
    "attached",
    asset,
  );

  return child.id;
}
