import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.notifications.getMany>;

export const prefetchNotifications = (params: Input) => {
  return prefetch(trpc.notifications.getMany.queryOptions(params));
};

export const prefetchNotification = (id: string) => {
  return prefetch(trpc.notifications.getOne.queryOptions({ id }));
};
