import "server-only";
import { ConfidenceLevel } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { MatchingLike } from "@/lib/device-matching";
import { findDeviceGroupIdsForMatchings } from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

/** Each overview card shows at most this many rows. */
const OVERVIEW_LIMIT = 5;

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
                vendorId: true,
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
});
