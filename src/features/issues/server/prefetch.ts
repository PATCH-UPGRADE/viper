import { prefetch, trpc } from "@/trpc/server";

/**
 * Prefetch a single issue
 */
export const prefetchIssue = (id: string) => {
  return prefetch(trpc.issues.getOne.queryOptions({ id }));
};
