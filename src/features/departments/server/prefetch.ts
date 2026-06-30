import { prefetch, trpc } from "@/trpc/server";

export const prefetchDepartments = () => {
  return prefetch(trpc.departments.getMany.queryOptions());
};
