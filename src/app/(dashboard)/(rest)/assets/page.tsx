import {
  AssetsContainer,
  AssetsList,
  AssetsLoading,
  AssetsError,
} from "@/features/assets/components/assets";
import { assetsParamsLoader } from "@/features/assets/server/params-loader";
import { prefetchAssets } from "@/features/assets/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

type Props = {
  searchParams: Promise<SearchParams>;
}

const Page = async ({ searchParams }: Props) => {
  await requireAuth();

  const params = await assetsParamsLoader(searchParams);
  await prefetchAssets(params);

  return (
    <AssetsContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<AssetsError />}>
          <Suspense fallback={<AssetsLoading />}>
            <AssetsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </AssetsContainer>
  )
};

export default Page;
