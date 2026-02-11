import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.webhooks.getMany>;

export const prefetchWebhooks = (params: Input) => {
  return prefetch(trpc.webhooks.getMany.queryOptions(params));
};
