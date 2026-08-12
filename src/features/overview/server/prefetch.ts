import "server-only";
import { prefetch, trpc } from "@/trpc/server";

export const prefetchOverview = () => {
  prefetch(trpc.overview.suggestedNotifications.queryOptions());
  prefetch(trpc.overview.recentUpdates.queryOptions());
  return prefetch(trpc.overview.suggestedWorkOrders.queryOptions());
};
