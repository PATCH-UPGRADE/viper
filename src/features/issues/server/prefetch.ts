import { prefetch, trpc } from "@/trpc/server";
import { inferInput } from "@trpc/tanstack-react-query";

type Input = inferInput<typeof trpc.issues.getManyInternalByAssetId>;

/**
 * Prefetch a single issue
 */
export const prefetchIssue = (id: string) => {
  return prefetch(trpc.issues.getOne.queryOptions({ id }));
};

/**
 * @param input (id, status, page, pageSize
 * @returns Prefetched page of issues filtered by the assetId and status fields
 */
export const prefetchIssuesByAssetId = (input: Input) => {
  return prefetch(trpc.issues.getManyInternalByAssetId.queryOptions(input));
};
