import { Suspense } from "react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { RemediationDetail } from "@/features/remediations/components/remediation-detail";
import { prefetchRemediation } from "@/features/remediations/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

interface PageProps {
  params: Promise<{
    remediationId: string;
  }>;
}

const Page = async ({ params }: PageProps) => {
  await requireAuth();

  const { remediationId } = await params;
  prefetchRemediation(remediationId);

  return (
    <HydrateClient>
      <ReportingErrorBoundary
        fallback={<ErrorView message="Failed to load remediation" />}
      >
        <Suspense fallback={<LoadingView message="Loading remediation" />}>
          <RemediationDetail remediationId={remediationId} />
        </Suspense>
      </ReportingErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
