import { Suspense } from "react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { ReportDetail } from "@/features/reports/components/report-detail";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

interface PageProps {
  params: Promise<{ chatId: string }>;
}

const Page = async ({ params }: PageProps) => {
  const { chatId } = await params;
  // Report + chat history in parallel on the server, not a client waterfall.
  prefetch(trpc.chat.getReportThread.queryOptions({ threadId: chatId }));
  prefetch(trpc.chat.getUIMessages.queryOptions({ threadId: chatId }));

  return (
    <HydrateClient>
      <ReportingErrorBoundary
        fallback={<ErrorView message="Couldn't load this report." />}
      >
        <Suspense fallback={<LoadingView message="Loading report…" />}>
          <ReportDetail chatId={chatId} />
        </Suspense>
      </ReportingErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
