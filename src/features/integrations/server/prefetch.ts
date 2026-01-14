import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.integrations.getManyIntegrations>;

/**
 * Prefetch all integrations
 */
export const prefetchIntegrations = (params: Input) => {
  return prefetch(trpc.integrations.getManyIntegrations.queryOptions(params));
};
