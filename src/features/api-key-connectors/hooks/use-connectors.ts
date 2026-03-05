import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

export const useSuspenseConnectors = () => {
  const trpc = useTRPC();

  return useSuspenseQuery(
    trpc.apiKeyConnectors.getManyTypeCountInternal.queryOptions(),
  );
};
