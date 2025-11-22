import {
  RemediationsContainer,
  RemediationsList,
  RemediationsLoading,
  RemediationsError,
} from "@/features/remediations/components/remediations";
import { remediationsParamsLoader } from "@/features/remediations/server/params-loader";
import { prefetchRemediations } from "@/features/remediations/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

type Props = {
  searchParams: Promise<SearchParams>;
}

const Page = async ({ searchParams }: Props) => {
  await requireAuth();

  const params = await remediationsParamsLoader(searchParams);
  await prefetchRemediations(params);

  return (
    <RemediationsContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<RemediationsError />}>
          <Suspense fallback={<RemediationsLoading />}>
            <RemediationsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </RemediationsContainer>
  )
};

export default Page;
