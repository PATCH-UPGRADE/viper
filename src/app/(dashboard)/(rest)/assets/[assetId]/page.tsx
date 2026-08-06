import { Suspense } from "react";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import {
  AssetDetailPage,
  AssetError,
  AssetLoading,
} from "@/features/assets/components/asset";
import { prefetchIssuesByAssetId } from "@/features/issues/server/prefetch";
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

  return (
    <HydrateClient>
      <ReportingErrorBoundary fallback={<AssetError />}>
        <Suspense fallback={<AssetLoading />}>
          <AssetDetailPage assetId={assetId} />
        </Suspense>
      </ReportingErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
