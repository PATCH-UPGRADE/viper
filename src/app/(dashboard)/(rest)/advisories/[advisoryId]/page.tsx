import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  AdvisoryDetailError,
  AdvisoryDetailLoading,
  AdvisoryDetailPage,
} from "@/features/advisories/components/advisories";
import { prefetchAdvisory } from "@/features/advisories/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

interface PageProps {
  params: Promise<{
    advisoryId: string;
  }>;
}

const Page = async ({ params }: PageProps) => {
  await requireAuth();

  const { advisoryId } = await params;

  await prefetchAdvisory(advisoryId);

  return (
    <HydrateClient>
      <ErrorBoundary fallback={<AdvisoryDetailError />}>
        <Suspense fallback={<AdvisoryDetailLoading />}>
          <AdvisoryDetailPage id={advisoryId} />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
