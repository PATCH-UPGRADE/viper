import { prefetch, trpc } from "@/trpc/server";
import { inferInput } from "@trpc/tanstack-react-query";

type Input = inferInput<typeof trpc.webhooks.getMany>;

export const prefetchWebhooks = (params: Input) => {
  return prefetch(trpc.webhooks.getMany.queryOptions(params));
};
