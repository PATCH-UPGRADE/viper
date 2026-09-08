import { Suspense } from "react";
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
        fallback={
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            Couldn&apos;t load this report.
          </div>
        }
      >
        <Suspense fallback={<div className="flex-1" />}>
          <ReportDetail chatId={chatId} />
        </Suspense>
      </ReportingErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
