import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { AssetWorkOrders } from "@/features/tracking/components/asset-work-orders";
import { SuggestedWorkOrderModal } from "@/features/tracking/components/suggested-work-order-modal";
import {
  TrackingError,
  TrackingLoading,
} from "@/features/tracking/components/tracking";
import { prefetchAssetWorkOrders } from "@/features/tracking/server/prefetch";
import { HydrateClient } from "@/trpc/server";

interface PageProps {
  params: Promise<{
    assetId: string;
  }>;
}

const Page = async ({ params }: PageProps) => {
  const { assetId } = await params;
  prefetchAssetWorkOrders(assetId);

  return (
    <HydrateClient>
      <ErrorBoundary fallback={<TrackingError />}>
        <Suspense fallback={<TrackingLoading />}>
          <SuggestedWorkOrderModal assetId={assetId} />
          <div className="px-4">
            <AssetWorkOrders assetId={assetId} />
          </div>
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
