import "server-only";
import type { Priority, TicketCategory } from "@/generated/prisma";
import { TicketStatus } from "@/generated/prisma";
import type { TransactionClient } from "@/lib/db";
import {
  deviceGroupWhereForMatching,
  matchingAppliesToDeviceGroup,
} from "@/lib/device-matching";
import { recordAssetActivity } from "./activities";

interface ParentFields {
  summary: string;
  body: string | null;
  category: TicketCategory;
  priority: Priority;
  creatorId: string;
  scheduledAt: Date | null;
  sourceLabel: string | null;
  isDraft: boolean;
}

export interface ExternalMappingInput {
  integrationId: string;
  externalId: string;
  lastSynced: Date;
}

/**
 * Record where a ticket lives on a vendor platform. Idempotent on
 * `(itemId, integrationId)`, so a retry refreshes the row rather than failing
 * on the unique constraint.
 */
export async function attachExternalMapping(
  tx: TransactionClient,
  ticketId: string,
  mapping: ExternalMappingInput,
): Promise<void> {
  await tx.externalWorkOrderMapping.upsert({
    where: {
      external_work_order_mappings_item_integration_key: {
        itemId: ticketId,
        integrationId: mapping.integrationId,
      },
    },
    update: {
      externalId: mapping.externalId,
      lastSynced: mapping.lastSynced,
    },
    create: { itemId: ticketId, ...mapping },
  });
}

// Creates the dedicated per-asset child ticket for parentTicketId + assetId
// (copying summary/body/category/etc. from the parent) and its AssetTicket
// join row. Idempotent: returns the existing child ticket id if one already
// exists for this (parentTicketId, assetId) pair instead of creating another.
export async function createAssetTicket(
  tx: TransactionClient,
  params: {
    parentTicketId: string;
    assetId: string;
    actorId: string;
    externalMapping?: ExternalMappingInput;
    /**
     * The parent's copied fields and the asset's labels, when the caller has
     * already read them. Creating N children otherwise re-reads the same parent
     * row N times, inside the caller's transaction.
     */
    parent?: ParentFields;
    asset?: { hostname: string | null; ip: string | null };
  },
): Promise<string> {
  const { parentTicketId, assetId, actorId, externalMapping } = params;

  const existing = await tx.assetTicket.findUnique({
    where: { parentTicketId_assetId: { parentTicketId, assetId } },
    select: { ticketId: true },
  });
  if (existing) {
    // The child is already here, but the mapping may not be: a retry that files
    // on the vendor platform a second time arrives with an id the first attempt
    // never recorded. Dropping it would leave a dispatched order untracked, and
    // the next inbound sync would file a duplicate ticket for it.
    if (externalMapping) {
      await attachExternalMapping(tx, existing.ticketId, externalMapping);
    }
    return existing.ticketId;
  }

  const [parent, asset] = await Promise.all([
    params.parent ??
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
          isDraft: true,
        },
      }),
    params.asset ??
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
      // A child is as visible as its parent. A child of a draft that stayed
      // visible would put an unapproved proposal on the asset's work orders.
      isDraft: parent.isDraft,
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

// Given an array of DeviceGroupMatching ids, finds every asset whose device
// group matches at least one of them and creates an AssetTicket for each,
// parented to parentTicketId.
export async function attachMatchingAssets(
  tx: TransactionClient,
  params: {
    parentTicketId: string;
    matchingIds: string[];
    actorId: string;
  },
): Promise<void> {
  const { parentTicketId, matchingIds, actorId } = params;
  if (matchingIds.length === 0) return;

  const matchings = await tx.deviceGroupMatching.findMany({
    where: { id: { in: matchingIds } },
    select: {
      manufacturerId: true,
      productId: true,
      versionId: true,
      versionRange: true,
    },
  });
  const candidates = await tx.asset.findMany({
    where: {
      deviceGroup: { OR: matchings.map(deviceGroupWhereForMatching) },
    },
    select: {
      id: true,
      hostname: true,
      ip: true,
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
  // Read once for the whole fan-out. Every child copies the same parent, so
  // leaving this to createAssetTicket would re-read it for each asset.
  const parent = await tx.workOrderTicket.findUniqueOrThrow({
    where: { id: parentTicketId },
    select: {
      summary: true,
      body: true,
      category: true,
      priority: true,
      creatorId: true,
      scheduledAt: true,
      sourceLabel: true,
      isDraft: true,
    },
  });

  // Guards against creating the same asset's child ticket twice — findMany
  // already returns each asset once, so this only matters if that changes.
  const attachedAssetIds = new Set<string>();
  for (const asset of candidates) {
    if (attachedAssetIds.has(asset.id)) continue;
    const matches = matchings.some((matching) =>
      matchingAppliesToDeviceGroup(matching, asset.deviceGroup),
    );
    if (!matches) continue;
    attachedAssetIds.add(asset.id);

    await createAssetTicket(tx, {
      parentTicketId,
      assetId: asset.id,
      actorId,
      parent,
      asset: { hostname: asset.hostname, ip: asset.ip },
    });
  }
}

// Walks up the ticket's parent chain: if every child of the parent is now
// Done, marks the parent Done too and recurses, so a whole tree of per-asset
// tickets completes as its last asset does.
export async function cascadeDoneStatus(
  tx: TransactionClient,
  ticketId: string,
  actorId: string,
): Promise<void> {
  const ticket = await tx.workOrderTicket.findUnique({
    where: { id: ticketId },
    select: {
      parentId: true,
      parent: {
        select: {
          status: true,
          children: { select: { status: true } },
        },
      },
    },
  });
  if (!ticket?.parentId || !ticket.parent) return;
  if (ticket.parent.status === TicketStatus.DONE) return;

  const allDone = ticket.parent.children.every(
    (c) => c.status === TicketStatus.DONE,
  );
  if (!allDone) return;

  const { count } = await tx.workOrderTicket.updateMany({
    where: { id: ticket.parentId, status: { not: TicketStatus.DONE } },
    data: { status: TicketStatus.DONE },
  });
  if (count === 0) return;
  await tx.ticketActivity.create({
    data: {
      ticketId: ticket.parentId,
      userId: actorId,
      type: "STATUS_CHANGED",
      data: {
        from: ticket.parent.status,
        to: TicketStatus.DONE,
        cause: "all-child-tickets-done",
      },
    },
  });

  await cascadeDoneStatus(tx, ticket.parentId, actorId);
}
