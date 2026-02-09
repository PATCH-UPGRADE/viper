import { prefetch, trpc } from "@/trpc/server";

export const prefetchWebhooks = () => {
  return prefetch(trpc.webhooks.getMany.queryOptions({}));
};

