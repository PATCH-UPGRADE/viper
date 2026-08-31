import "server-only";
import { prefetchDebrief } from "@/features/debrief/server/prefetch";
import { prefetch, trpc } from "@/trpc/server";

export const prefetchOverview = () => {
  prefetchDebrief();
  prefetch(trpc.overview.suggestedNotifications.queryOptions());
  prefetch(trpc.overview.recentUpdates.queryOptions());
  return prefetch(trpc.overview.suggestedWorkOrders.queryOptions());
};
