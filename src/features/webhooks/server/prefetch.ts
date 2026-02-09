import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

export const prefetchWebhooks = () => {
  return prefetch(trpc.webhooks.getMany.queryOptions());
};

