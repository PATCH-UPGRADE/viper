import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.issues.getManyInternalByStatusAndAssetId>;

/**
 * Prefetch a single issue
 */
export const prefetchIssue = (id: string) => {
  return prefetch(trpc.issues.getOne.queryOptions({ id }));
};

/**
 * @param input (assetId, issueStatus, page, pageSize)
 * @returns Prefetched page of issues filtered by the assetId and status fields
 */
export const prefetchIssuesByAssetId = (input: Input) => {
  return prefetch(
    trpc.issues.getManyInternalByStatusAndAssetId.queryOptions(input),
  );
};
