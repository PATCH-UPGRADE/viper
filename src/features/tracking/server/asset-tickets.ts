import "server-only";
import { TicketStatus } from "@/generated/prisma";
import type { TransactionClient } from "@/lib/db";
import {
  deviceGroupWhereForMatching,
  matchingAppliesToDeviceGroup,
} from "@/lib/device-matching";
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

/**
 * Resolve a device-group matching to its concrete assets and attach each one
 * as a dedicated per-asset child of `parentTicketId`, same as a direct
 * attach.
 */
export async function createAssetTicketsForDeviceGroupMatching(
  tx: TransactionClient,
  params: {
    parentTicketId: string;
    deviceGroupMatchingId: string;
    actorId: string;
  },
): Promise<void> {
  const { parentTicketId, deviceGroupMatchingId, actorId } = params;

  const matching = await tx.deviceGroupMatching.findUniqueOrThrow({
    where: { id: deviceGroupMatchingId },
    select: {
      manufacturerId: true,
      productId: true,
      versionId: true,
      versionRange: true,
    },
  });
  const candidates = await tx.asset.findMany({
    where: { deviceGroup: deviceGroupWhereForMatching(matching) },
    select: {
      id: true,
      deviceGroup: {
        select: {
          id: true,
          manufacturerId: true,
          productId: true,
          versionId: true,
          version: { select: { canonicalName: true } },
        },
      },
    },
  });
  for (const asset of candidates) {
    if (!matchingAppliesToDeviceGroup(matching, asset.deviceGroup)) continue;
    await createAssetTicket(tx, { parentTicketId, assetId: asset.id, actorId });
  }
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
          assets: { select: { ticket: { select: { status: true } } } },
        },
      },
    },
  });
  if (!link || link.parentTicket.status === TicketStatus.DONE) return;

  const allDone = link.parentTicket.assets.every(
    (a) => a.ticket.status === TicketStatus.DONE,
  );
  if (!allDone) return;

  await tx.workOrderTicket.update({
    where: { id: link.parentTicketId },
    data: { status: TicketStatus.DONE },
  });
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
