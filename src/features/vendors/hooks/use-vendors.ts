import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { useVendorsParams } from "./use-vendors-params";

/**
 * Hook to fetch a page of vendors using suspense
 */
export const useSuspenseVendors = () => {
  const trpc = useTRPC();
  const [params] = useVendorsParams();

  return useSuspenseQuery(trpc.vendors.getMany.queryOptions(params));
};
