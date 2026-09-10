import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.remediations.getMany>;

/**
 * Prefetch all remediations
 */
export const prefetchRemediations = (params: Input) => {
  return prefetch(trpc.remediations.getMany.queryOptions(params));
};

/**
 * Prefetch a single remediation
 */
export const prefetchRemediation = (id: string) => {
  return prefetch(trpc.remediations.getOne.queryOptions({ id }));
};
