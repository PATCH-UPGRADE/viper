import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  AssetContainer,
  AssetError,
  AssetLoading,
} from "@/features/assets/components/asset";
import { AssetLayout } from "@/features/assets/components/asset-layout";
import { prefetchAsset } from "@/features/assets/server/prefetch";
import { AssetWorkOrders } from "@/features/tracking/components/asset-work-orders";
import { prefetchAssetWorkOrders } from "@/features/tracking/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

interface PageProps {
  params: Promise<{
    assetId: string;
  }>;
}

const Page = async ({ params }: PageProps) => {
  await requireAuth();

  const { assetId } = await params;

  prefetchAsset(assetId);
  prefetchAssetWorkOrders(assetId);

  return (
    <AssetContainer>
      <HydrateClient>
        <AssetLayout>
          <ErrorBoundary fallback={<AssetError />}>
            <Suspense fallback={<AssetLoading />}>
              <div className="px-4">
                <AssetWorkOrders assetId={assetId} />
              </div>
            </Suspense>
          </ErrorBoundary>
        </AssetLayout>
      </HydrateClient>
    </AssetContainer>
  );
};

export default Page;
