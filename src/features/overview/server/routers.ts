import "server-only";
import { RECENT_UPDATES_WINDOW_MS } from "@/config/constants";
import {
  ConfidenceLevel,
  NotificationType,
  TicketActivityType,
  type TicketStatus,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { type MatchingLike, resolveMatches } from "@/lib/device-matching";
import { deviceGroupLabel } from "@/lib/markdown/device-group";
import { findDeviceGroupIdsForMatchings } from "@/lib/router-utils";
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
  const deviceGroupIds = await findDeviceGroupIdsForMatchings(matchings);
  if (deviceGroupIds.length === 0) return 0;
  return prisma.asset.count({
    where: { deviceGroupId: { in: deviceGroupIds } },
  });
}

/** A device group that currently has assets, plus how many. */
type InventoryDeviceGroup = {
  id: string;
  manufacturerId: string | null;
  productId: string | null;
  versionId: string | null;
  version: { canonicalName: string } | null;
  _count: { assets: number };
};

/**
 * How many assets in the inventory a set of matchings covers.
 *
 * The caller passes every device group that owns assets, fetched once, so this
 * resolves in memory. Doing it per notification would be a query each.
 */
const inventoryAssetCount = (
  matchings: MatchingLike[],
  inventory: InventoryDeviceGroup[],
) =>
  resolveMatches(matchings, inventory).reduce(
    (total, group) => total + group._count.assets,
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
   * on the "Updates in the last day" card.
   */
  recentUpdates: protectedProcedure.query(async () => {
    const since = new Date(Date.now() - RECENT_UPDATES_WINDOW_MS);

    const [inventory, notifications, statusChanges, newAssets] =
      await Promise.all([
        prisma.deviceGroup.findMany({
          where: { assets: { some: {} } },
          select: {
            id: true,
            manufacturerId: true,
            productId: true,
            versionId: true,
            version: { select: { canonicalName: true } },
            _count: { select: { assets: true } },
          },
        }),

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
            deviceGroup: {
              select: {
                id: true,
                manufacturer: { select: { canonicalDisplayName: true } },
                product: { select: { canonicalDisplayName: true } },
              },
            },
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

    const latestByTicket = new Map<string, (typeof statusChanges)[number]>();
    for (const change of statusChanges) {
      if (!latestByTicket.has(change.ticket.id)) {
        latestByTicket.set(change.ticket.id, change);
      }
    }
    const workOrders = changeGroup(
      [...latestByTicket.values()].map((change) => {
        const data = change.data as { from?: string; to?: string };
        return {
          id: change.ticket.id,
          summary: change.ticket.summary,
          changedAt: change.createdAt,
          from: (data.from ?? null) as TicketStatus | null,
          to: (data.to ?? null) as TicketStatus | null,
        };
      }),
    );

    const newAssetCount = newAssets.length;
    const assetRows = new Map<
      string,
      { key: string; label: string; source: string | null; count: number }
    >();
    for (const asset of newAssets) {
      const source = asset.externalMappings[0]?.integration.name ?? null;
      const label = deviceGroupLabel(asset.deviceGroup);
      const key = `${asset.deviceGroup.id}:${source ?? ""}`;
      const existing = assetRows.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        assetRows.set(key, { key, label, source, count: 1 });
      }
    }

    const advisories = byType(NotificationType.Advisory);
    const recalls = byType(NotificationType.Recall);

    return {
      advisories,
      recalls,
      workOrders,
      newAssets: changeGroup([...assetRows.values()], newAssetCount),
      totalCount:
        advisories.count + recalls.count + workOrders.count + newAssetCount,
    };
  }),
});
