import "server-only";
import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.integrations.getMany>;

/**
 * Prefetch all integrations
 */
export const prefetchIntegrations = (params: Input) => {
  console.log("prefetch", params);
  return prefetch(trpc.integrations.getMany.queryOptions(params));
};
