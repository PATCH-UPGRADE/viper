import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  AssetDetailPage,
  AssetError,
  AssetLoading,
} from "@/features/assets/components/asset";
import { prefetchIssuesByAssetId } from "@/features/issues/server/prefetch";
import { SuggestedWorkOrderModal } from "@/features/tracking/components/suggested-work-order-modal";
import { prefetchAssetWorkOrders } from "@/features/tracking/server/prefetch";
import { IssueStatus } from "@/generated/prisma";
import { HydrateClient } from "@/trpc/server";

interface PageProps {
  params: Promise<{
    assetId: string;
  }>;
}

const Page = async ({ params }: PageProps) => {
  const { assetId } = await params;

  for (const issueStatus of Object.values(IssueStatus)) {
    prefetchIssuesByAssetId({ assetId, issueStatus });
  }
  prefetchAssetWorkOrders(assetId);

  return (
    <HydrateClient>
      <ErrorBoundary fallback={<AssetError />}>
        <Suspense fallback={<AssetLoading />}>
          <SuggestedWorkOrderModal assetId={assetId} />
          <AssetDetailPage assetId={assetId} />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
