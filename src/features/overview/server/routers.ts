import "server-only";
import { RECENT_UPDATES_WINDOW_MS } from "@/config/constants";
import {
  ConfidenceLevel,
  NotificationType,
  TicketActivityType,
  type TicketStatus,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  type DeviceIdentity,
  deviceKey,
  type MatchingLike,
  resolveMatches,
} from "@/lib/device-matching";
import { deviceLabel } from "@/lib/markdown/device-group";
import { findAssetIdsForMatchings } from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

/** Each overview card shows at most this many rows. */
const OVERVIEW_LIMIT = 5;

const CHANGE_ROW_LIMIT = 10;

/** Most urgent first — see the Priority enum in prisma/schema.prisma. */
const ORDER_BY_URGENCY = [
  { priority: "asc" as const },
  { updatedAt: "desc" as const },
];

/** How many distinct assets a notification touches, across all its matchings. */
async function notificationAssetCount(
  matchings: MatchingLike[],
): Promise<number> {
  return (await findAssetIdsForMatchings(matchings)).length;
}

/** One manufacturer/product/version that assets have, plus how many. */
type InventoryDevice = DeviceIdentity & { assetCount: number };

/** Every device identity that assets have, with its asset count. */
async function deviceInventory(): Promise<InventoryDevice[]> {
  const groups = await prisma.asset.groupBy({
    by: ["manufacturerId", "productId", "versionId"],
    _count: { _all: true },
  });
  const versionIds = groups.flatMap((g) => (g.versionId ? [g.versionId] : []));
  const versions = await prisma.version.findMany({
    where: { id: { in: versionIds } },
    select: { id: true, canonicalName: true },
  });
  const versionName = new Map(versions.map((v) => [v.id, v.canonicalName]));
  return groups.map((g) => ({
    id: deviceKey(g),
    manufacturerId: g.manufacturerId,
    productId: g.productId,
    versionId: g.versionId,
    version: g.versionId
      ? { canonicalName: versionName.get(g.versionId) ?? "" }
      : null,
    assetCount: g._count._all,
  }));
}

/**
 * How many assets in the inventory a set of matchings covers.
 *
 * The caller passes the device inventory, fetched once, so this resolves in
 * memory. Doing it per notification would be a query each.
 */
const inventoryAssetCount = (
  matchings: MatchingLike[],
  inventory: InventoryDevice[],
) =>
  resolveMatches(matchings, inventory).reduce(
    (total, device) => total + device.assetCount,
    0,
  );

/**
 * A count paired with the rows shown when its chip is expanded. `count` and
 * `items.length` can legitimately differ — the assets group counts assets but
 * lists them collapsed by model — so `truncated` says outright whether rows
 * were dropped.
 */
type ChangeGroup<T> = { count: number; items: T[]; truncated: boolean };

const changeGroup = <T>(items: T[], count = items.length): ChangeGroup<T> => ({
  count,
  items: items.slice(0, CHANGE_ROW_LIMIT),
  truncated: items.length > CHANGE_ROW_LIMIT,
});

type StatusChangeRow = {
  data: unknown;
  createdAt: Date;
  ticket: { id: string; summary: string };
};

/**
 * One row per ticket, carrying its most recent status change. Expects the rows
 * newest-first: a ticket touched three times in the window still counts once.
 */
const activitiesToWorkOrders = (statusChanges: StatusChangeRow[]) => {
  const latestByTicket = new Map<string, StatusChangeRow>();
  for (const change of statusChanges) {
    if (!latestByTicket.has(change.ticket.id)) {
      latestByTicket.set(change.ticket.id, change);
    }
  }

  return [...latestByTicket.values()].map((change) => {
    const data = change.data as { from?: string; to?: string };
    return {
      id: change.ticket.id,
      summary: change.ticket.summary,
      changedAt: change.createdAt,
      from: (data.from ?? null) as TicketStatus | null,
      to: (data.to ?? null) as TicketStatus | null,
    };
  });
};

type NewAssetRow = Parameters<typeof deviceLabel>[0] & {
  manufacturerId: string | null;
  productId: string | null;
  externalMappings: { integration: { name: string } }[];
};

const assetsToRows = (newAssets: NewAssetRow[]) => {
  const rows = new Map<
    string,
    { key: string; label: string; source: string | null; count: number }
  >();

  for (const asset of newAssets) {
    const source = asset.externalMappings[0]?.integration.name ?? null;
    const key = `${asset.manufacturerId}:${asset.productId}:${source ?? ""}`;
    const existing = rows.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      rows.set(key, {
        key,
        label: deviceLabel(asset),
        source,
        count: 1,
      });
    }
  }

  return [...rows.values()];
};

export const overviewRouter = createTRPCRouter({
  /** Highest-priority notifications the current user has not read yet. */
  suggestedNotifications: protectedProcedure.query(async ({ ctx }) => {
    const notifications = await prisma.notification.findMany({
      where: { reads: { none: { userId: ctx.auth.user.id } } },
      select: {
        id: true,
        title: true,
        summary: true,
        type: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        deviceGroupsMatchings: {
          select: {
            confidence: true,
            deviceGroupMatching: {
              select: {
                manufacturerId: true,
                productId: true,
                versionId: true,
                versionRange: true,
              },
            },
          },
        },
      },
      orderBy: ORDER_BY_URGENCY,
      take: OVERVIEW_LIMIT,
    });

    return Promise.all(
      notifications.map(async ({ deviceGroupsMatchings, ...notification }) => ({
        ...notification,
        assetCount: await notificationAssetCount(
          deviceGroupsMatchings
            .filter((m) => m.confidence !== ConfidenceLevel.Rejected)
            .map((m) => m.deviceGroupMatching),
        ),
      })),
    );
  }),

  /** Highest-priority top-level work orders. */
  suggestedWorkOrders: protectedProcedure.query(async ({ ctx }) => {
    const tickets = await prisma.workOrderTicket.findMany({
      where: { isDraft: false, parentId: null },
      select: {
        id: true,
        summary: true,
        status: true,
        priority: true,
        scheduledAt: true,
        updatedAt: true,
        assignee: { select: { id: true, name: true } },
        // Scoped to the current user, so the row reflects whether *they*
        // watch the ticket.
        watchers: {
          where: { userId: ctx.auth.user.id },
          select: { userId: true },
        },
        _count: { select: { assets: true } },
      },
      orderBy: ORDER_BY_URGENCY,
      take: OVERVIEW_LIMIT,
    });

    return tickets.map(({ watchers, _count, ...ticket }) => ({
      ...ticket,
      isWatching: watchers.length > 0,
      assetCount: _count.assets,
    }));
  }),

  /**
   * Everything that changed in the trailing 24 hours, grouped into the chips
   * on the "Updates in the Last Day" card.
   */
  recentUpdates: protectedProcedure.query(async () => {
    const since = new Date(Date.now() - RECENT_UPDATES_WINDOW_MS);

    const [inventory, notifications, statusChanges, newAssets] =
      await Promise.all([
        deviceInventory(),

        prisma.notification.findMany({
          where: {
            createdAt: { gte: since },
            type: { in: [NotificationType.Advisory, NotificationType.Recall] },
          },
          select: {
            id: true,
            title: true,
            summary: true,
            type: true,
            priority: true,
            createdAt: true,
            deviceGroupsMatchings: {
              select: {
                confidence: true,
                deviceGroupMatching: {
                  select: {
                    manufacturerId: true,
                    productId: true,
                    versionId: true,
                    versionRange: true,
                  },
                },
              },
            },
          },
          orderBy: [
            { priority: "asc" as const },
            { createdAt: "desc" as const },
          ],
        }),

        // One row per status change. Collapsed to the latest change per ticket
        // below, so a ticket touched twice still counts once.
        prisma.ticketActivity.findMany({
          where: {
            type: TicketActivityType.STATUS_CHANGED,
            createdAt: { gte: since },
            ticket: { isDraft: false },
          },
          select: {
            data: true,
            createdAt: true,
            ticket: { select: { id: true, summary: true } },
          },
          orderBy: { createdAt: "desc" },
        }),

        prisma.asset.findMany({
          where: { createdAt: { gte: since } },
          select: {
            manufacturerId: true,
            productId: true,
            manufacturer: { select: { canonicalDisplayName: true } },
            product: { select: { canonicalDisplayName: true } },
            // Which integration brought the asset in, for the "Added via …"
            // line. Manually created assets have no mapping.
            externalMappings: {
              select: { integration: { select: { name: true } } },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const withAssets = notifications
      .map(({ deviceGroupsMatchings, ...notification }) => ({
        ...notification,
        assetCount: inventoryAssetCount(
          deviceGroupsMatchings
            .filter((m) => m.confidence !== ConfidenceLevel.Rejected)
            .map((m) => m.deviceGroupMatching),
          inventory,
        ),
      }))
      .filter((notification) => notification.assetCount > 0);

    const byType = (type: NotificationType) =>
      changeGroup(withAssets.filter((n) => n.type === type));

    const advisories = byType(NotificationType.Advisory);
    const recalls = byType(NotificationType.Recall);
    const workOrders = changeGroup(activitiesToWorkOrders(statusChanges));

    return {
      advisories,
      recalls,
      workOrders,
      newAssets: changeGroup(assetsToRows(newAssets), newAssets.length),
      totalCount:
        advisories.count + recalls.count + workOrders.count + newAssets.length,
    };
  }),
});
