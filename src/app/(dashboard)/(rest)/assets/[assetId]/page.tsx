import { AssetContainer, AssetDetailPage, AssetError, AssetLoading } from "@/features/assets/components/asset";
import { assetDetailParams } from "@/features/assets/params";
import { prefetchAsset } from "@/features/assets/server/prefetch";
import { prefetchIssuesByAssetId } from "@/features/issues/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import { parseAsNumberLiteral } from "nuqs/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

interface PageProps {
  params: Promise<{
    assetId: string;
  }>;
}

const Page = async ({ params }: PageProps) => {
  await requireAuth();

  const { assetId } = await params;

  prefetchAsset(assetId);
  prefetchIssuesByAssetId({ id: assetId, status: 'PENDING'});

  return (
    <AssetContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<AssetError />}>
          <Suspense fallback={<AssetLoading />}>
            <AssetDetailPage id={assetId} />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </AssetContainer>
  )
};

export default Page;
