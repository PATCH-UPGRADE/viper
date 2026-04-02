import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.advisories.getMany>;

/**
 * Prefetch all advisories
 */
export const prefetchAdvisories = (params: Input) => {
  return prefetch(trpc.advisories.getMany.queryOptions(params));
};

/**
 * Prefetch a single advisory
 */
export const prefetchAdvisory = (id: string) => {
  return prefetch(trpc.advisories.getOne.queryOptions({ id }));
};
