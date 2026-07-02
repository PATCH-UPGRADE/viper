import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  TicketDetailError,
  TicketDetailLoading,
  TicketDetailPage,
} from "@/features/tracking/components/ticket-detail";
import { prefetchTrackingTicket } from "@/features/tracking/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

interface PageProps {
  params: Promise<{ ticketId: string }>;
}

const Page = async ({ params }: PageProps) => {
  await requireAuth();
  const { ticketId } = await params;
  await prefetchTrackingTicket(ticketId);

  return (
    <HydrateClient>
      <ErrorBoundary fallback={<TicketDetailError />}>
        <Suspense fallback={<TicketDetailLoading />}>
          <TicketDetailPage id={ticketId} />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
