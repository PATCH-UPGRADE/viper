import { prefetch, trpc } from "@/trpc/server";

export const prefetchMitigationPlans = (notificationId: string) => {
  return prefetch(
    trpc.mitigation.getForNotification.queryOptions({ notificationId }),
  );
};
