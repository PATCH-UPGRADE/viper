import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.assets.getMany>;

/**
 * Prefetch all assets
 */
export const prefetchAssets = (params: Input) => {
  return prefetch(trpc.assets.getMany.queryOptions(params));
};

type DashboardInput = inferInput<
  typeof trpc.assets.getManyDashboardInternal
>;

export const prefetchAssetsDashboard = (params: DashboardInput) => {
  return prefetch(
    trpc.assets.getManyDashboardInternal.queryOptions(params),
  );
};

/**
 * Prefetch a single asset
 */
export const prefetchAsset = (id: string) => {
  return prefetch(trpc.assets.getOne.queryOptions({ id }));
};
