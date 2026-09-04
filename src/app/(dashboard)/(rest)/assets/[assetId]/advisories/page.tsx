import { Suspense } from "react";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { AssetAdvisories } from "@/features/inbox/components/asset-advisories";
import {
  NotificationsError,
  NotificationsLoading,
} from "@/features/inbox/components/notifications";
import { prefetchAssetAdvisories } from "@/features/inbox/server/prefetch";
import { HydrateClient } from "@/trpc/server";

interface PageProps {
  params: Promise<{
    assetId: string;
  }>;
}

const Page = async ({ params }: PageProps) => {
  const { assetId } = await params;
  prefetchAssetAdvisories(assetId);

  return (
    <HydrateClient>
      <ReportingErrorBoundary fallback={<NotificationsError />}>
        <Suspense fallback={<NotificationsLoading />}>
          <div className="px-4">
            <AssetAdvisories assetId={assetId} />
          </div>
        </Suspense>
      </ReportingErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
