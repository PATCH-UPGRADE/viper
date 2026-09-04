import { Suspense } from "react";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { ReportsLanding } from "@/features/reports/components/reports-landing";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

const Page = async () => {
  await requireAuth();
  prefetch(
    trpc.chat.getManyThreads.queryOptions({ limit: 50, withReport: true }),
  );

  return (
    <HydrateClient>
      <ReportingErrorBoundary
        fallback={
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            Couldn&apos;t load your reports.
          </div>
        }
      >
        <Suspense fallback={<div className="flex-1" />}>
          <ReportsLanding />
        </Suspense>
      </ReportingErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
