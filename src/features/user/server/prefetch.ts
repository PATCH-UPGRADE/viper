import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.user.getManyApiTokens>;

/**
 * Prefetch all API tokens
 */
export const prefetchApiTokens = (params: Input) => {
  return prefetch(trpc.user.getManyApiTokens.queryOptions(params));
};
