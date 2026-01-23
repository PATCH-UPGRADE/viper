import {
  AssetContainer,
  AssetDetailPage,
  AssetError,
  AssetLoading,
} from "@/features/assets/components/asset";
import { prefetchAsset } from "@/features/assets/server/prefetch";
import { prefetchIssuesByAssetId } from "@/features/issues/server/prefetch";
import { IssueStatus } from "@/generated/prisma";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
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

  for (const issueStatus of Object.values(IssueStatus)) {
    prefetchIssuesByAssetId({ assetId: assetId, issueStatus });
  }

  return (
    <AssetContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<AssetError />}>
          <Suspense fallback={<AssetLoading />}>
            <AssetDetailPage assetId={assetId} />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </AssetContainer>
  );
};

export default Page;
