import "server-only";
import { ConfidenceLevel, Priority } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { MatchingLike } from "@/lib/device-matching";
import { findDeviceGroupIdsForMatchings } from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

/** Each overview card shows at most this many rows. */
const OVERVIEW_LIMIT = 5;

/**
 * Urgency order for the overview cards. This is not the Priority enum order:
 * the enum declares Monitor before Defer, the cards show Defer first.
 */
const PRIORITY_ORDER: Priority[] = [
  Priority.Critical,
  Priority.High,
  Priority.Defer,
  Priority.Monitor,
  Priority.Unsorted,
];

/**
 * Collect the first OVERVIEW_LIMIT rows in PRIORITY_ORDER. Prisma sorts an enum
 * by its declaration order, which is not the order the cards need, so each
 * priority is a separate query. They run together rather than one at a time:
 * this is the default landing page, and stopping early would serialize up to
 * one round trip per priority. Each bucket is capped, so the fan-out reads at
 * most OVERVIEW_LIMIT rows per priority.
 */
async function takeByPriority<T>(
  fetchBucket: (priority: Priority, take: number) => Promise<T[]>,
): Promise<T[]> {
  const buckets = await Promise.all(
    PRIORITY_ORDER.map((priority) => fetchBucket(priority, OVERVIEW_LIMIT)),
  );
  return buckets.flat().slice(0, OVERVIEW_LIMIT);
}

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

export const overviewRouter = createTRPCRouter({
  /** Highest-priority notifications the current user has not read yet. */
  suggestedNotifications: protectedProcedure.query(async ({ ctx }) => {
    const notifications = await takeByPriority((priority, take) =>
      prisma.notification.findMany({
        where: {
          priority,
          reads: { none: { userId: ctx.auth.user.id } },
        },
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
                  vendorId: true,
                  productId: true,
                  versionId: true,
                  versionRange: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take,
      }),
    );

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
    const tickets = await takeByPriority((priority, take) =>
      prisma.workOrderTicket.findMany({
        where: { priority, isDraft: false, parentId: null },
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
        orderBy: { updatedAt: "desc" },
        take,
      }),
    );

    return tickets.map(({ watchers, _count, ...ticket }) => ({
      ...ticket,
      isWatching: watchers.length > 0,
      assetCount: _count.assets,
    }));
  }),
});
