import { useSuspenseQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import type { ResourceType } from "@/generated/prisma";
import { useTRPC } from "@/trpc/client";
import { connectorsParams } from "../params";

export const useSuspenseConnectors = () => {
  const trpc = useTRPC();

  return useSuspenseQuery(
    trpc.apiKeyConnectors.getManyTypeCountInternal.queryOptions(),
  );
};

export const useConnectorParams = () => {
  return useQueryStates(connectorsParams);
};

export const useSuspenseConnectorsByResourceType = ({
  resourceType,
}: {
  resourceType: ResourceType;
}) => {
  const trpc = useTRPC();
  const [params] = useConnectorParams();

  return useSuspenseQuery(
    trpc.apiKeyConnectors.getManyByTypeInternal.queryOptions({
      ...params,
      resourceType,
    }),
  );
};
