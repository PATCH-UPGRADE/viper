import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  OverviewContainer,
  OverviewError,
  OverviewLoading,
  OverviewPanels,
} from "@/features/overview/components/overview";
import { prefetchOverview } from "@/features/overview/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

const Page = async () => {
  const session = await requireAuth();
  await prefetchOverview();

  return (
    <OverviewContainer name={session.user.name ?? "there"}>
      <HydrateClient>
        <ErrorBoundary fallback={<OverviewError />}>
          <Suspense fallback={<OverviewLoading />}>
            <OverviewPanels />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </OverviewContainer>
  );
};

export default Page;
