import { Suspense } from "react";
import { ErrorView } from "@/components/entity-components";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { ReportsSidebar } from "@/features/reports/components/reports-sidebar";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

const Layout = async ({ children }: { children: React.ReactNode }) => {
  await requireAuth();
  prefetch(trpc.chat.getReportThreads.queryOptions({ limit: 50 }));

  return (
    <div className="flex h-[calc(100svh-3.5rem)] overflow-hidden">
      <HydrateClient>
        <ReportingErrorBoundary
          fallback={
            <div className="w-72 shrink-0 border-r">
              <ErrorView message="Couldn't load your reports." />
            </div>
          }
        >
          <Suspense fallback={<aside className="w-72 shrink-0 border-r" />}>
            <ReportsSidebar />
          </Suspense>
        </ReportingErrorBoundary>
      </HydrateClient>
      {children}
    </div>
  );
};

export default Layout;
