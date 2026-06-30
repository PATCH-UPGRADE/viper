import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.tracking.getMany>;

export const prefetchTrackingTickets = (params: Input) => {
  prefetch(trpc.tagColors.getCategoryColors.queryOptions());
  return prefetch(trpc.tracking.getMany.queryOptions(params));
};

export const prefetchTrackingTicket = (id: string) => {
  prefetch(trpc.tagColors.getCategoryColors.queryOptions());
  return prefetch(trpc.tracking.getOne.queryOptions({ id }));
};
