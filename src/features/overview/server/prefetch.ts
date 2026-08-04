import { prefetch, trpc } from "@/trpc/server";

export const prefetchOverview = () => {
  prefetch(trpc.overview.suggestedNotifications.queryOptions());
  return prefetch(trpc.overview.suggestedWorkOrders.queryOptions());
};
