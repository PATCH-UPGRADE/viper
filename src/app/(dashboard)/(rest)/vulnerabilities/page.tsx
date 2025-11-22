import {
  VulnerabilitiesContainer,
  VulnerabilitiesList,
  VulnerabilitiesLoading,
  VulnerabilitiesError,
} from "@/features/vulnerabilities/components/vulnerabilities";
import { vulnerabilitiesParamsLoader } from "@/features/vulnerabilities/server/params-loader";
import { prefetchVulnerabilities } from "@/features/vulnerabilities/server/prefetch";
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

  const params = await vulnerabilitiesParamsLoader(searchParams);
  await prefetchVulnerabilities(params);

  return (
    <VulnerabilitiesContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<VulnerabilitiesError />}>
          <Suspense fallback={<VulnerabilitiesLoading />}>
            <VulnerabilitiesList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </VulnerabilitiesContainer>
  )
};

export default Page;
