import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  NotificationDetailError,
  NotificationDetailLoading,
  NotificationDetailPage,
} from "@/features/inbox/components/notification-detail";
import { prefetchNotification } from "@/features/inbox/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

const Page = async ({ params }: PageProps) => {
  await requireAuth();
  const { id } = await params;
  await prefetchNotification(id);

  return (
    <HydrateClient>
      <ErrorBoundary fallback={<NotificationDetailError />}>
        <Suspense fallback={<NotificationDetailLoading />}>
          <NotificationDetailPage id={id} />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
