import "server-only";
import { prefetch, trpc } from "@/trpc/server";

export const prefetchDebrief = () =>
  prefetch(trpc.debrief.getForMyDepartment.queryOptions());
