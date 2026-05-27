import { prefetch, trpc } from "@/trpc/server";

export const prefetchCategoryColors = () => {
  return prefetch(trpc.tagColors.getCategoryColors.queryOptions());
};
