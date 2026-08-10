import "server-only";
import { TicketStatus } from "@/generated/prisma";
import type { TransactionClient } from "@/lib/db";
import { recordAssetActivity } from "./activities";

export async function createAssetTicket(
  tx: TransactionClient,
  params: {
    parentTicketId: string;
    assetId: string;
    actorId: string;
    externalMapping?: {
      integrationId: string;
      externalId: string;
      lastSynced: Date;
    };
  },
): Promise<string> {
  const { parentTicketId, assetId, actorId, externalMapping } = params;

  const existing = await tx.assetTicket.findUnique({
    where: { parentTicketId_assetId: { parentTicketId, assetId } },
    select: { ticketId: true },
  });
  if (existing) return existing.ticketId;

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
      scheduledAt: parent.scheduledAt,
      sourceLabel: parent.sourceLabel,
      creator: { connect: { id: parent.creatorId } },
      parent: { connect: { id: parentTicketId } },
      ticket: { create: { assetId, parentTicketId } },
      ...(externalMapping && {
        externalMappings: { create: externalMapping },
      }),
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

export async function cascadeDoneStatus(
  tx: TransactionClient,
  ticketId: string,
  actorId: string,
): Promise<void> {
  const link = await tx.assetTicket.findUnique({
    where: { ticketId },
    select: {
      parentTicketId: true,
      parentTicket: {
        select: {
          status: true,
          children: { select: { status: true } },
        },
      },
    },
  });
  if (!link || link.parentTicket.status === TicketStatus.DONE) return;

  const allDone = link.parentTicket.children.every(
    (c) => c.status === TicketStatus.DONE,
  );
  if (!allDone) return;

  const { count } = await tx.workOrderTicket.updateMany({
    where: { id: link.parentTicketId, status: { not: TicketStatus.DONE } },
    data: { status: TicketStatus.DONE },
  });
  if (count === 0) return;
  await tx.ticketActivity.create({
    data: {
      ticketId: link.parentTicketId,
      userId: actorId,
      type: "STATUS_CHANGED",
      data: {
        from: link.parentTicket.status,
        to: TicketStatus.DONE,
        cause: "all-asset-tickets-done",
      },
    },
  });

  await cascadeDoneStatus(tx, link.parentTicketId, actorId);
}
