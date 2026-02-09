import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.deviceArtifacts.getMany>;

/**
 * Prefetch all deviceArtifacts
 */
export const prefetchDeviceArtifacts = (params: Input) => {
  return prefetch(trpc.deviceArtifacts.getMany.queryOptions(params));
};

/**
 * Prefetch a single deviceArtifact
 */
export const prefetchDeviceArtifact = (id: string) => {
  return prefetch(trpc.deviceArtifacts.getOne.queryOptions({ id }));
};
