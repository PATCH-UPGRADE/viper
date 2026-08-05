import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.vendors.getMany>;

/**
 * Prefetch a page of vendors
 */
export const prefetchVendors = (params: Input) => {
  return prefetch(trpc.vendors.getMany.queryOptions(params));
};
