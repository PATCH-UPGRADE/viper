import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import {
  IntegrationsError,
  IntegrationsList,
  IntegrationsLoading,
} from "@/features/integrations/components/integrations";
import { paginationParamsLoader } from "@/features/integrations/server/params-loader";
import { prefetchIntegrations } from "@/features/integrations/server/prefetch";
import {
  integrationsMapping,
  isValidResourceTypeKey,
} from "@/features/integrations/types";
import { requireAuth } from "@/lib/auth-utils";
import type { CombinedPageProps } from "@/lib/page-types";
import { HydrateClient } from "@/trpc/server";

const Page = async ({
  params,
  searchParams,
}: CombinedPageProps<"resourceTypeUrl">) => {
  await requireAuth();
  const { resourceTypeUrl } = await params;

  // Validate resourceType
  if (!isValidResourceTypeKey(resourceTypeUrl)) {
    notFound();
  }

  const resourceType = integrationsMapping[resourceTypeUrl].type;
  const paginationParams = await paginationParamsLoader(searchParams);
  await prefetchIntegrations({ ...paginationParams, resourceType });

  return (
    <HydrateClient>
      <ReportingErrorBoundary fallback={<IntegrationsError />}>
        <Suspense fallback={<IntegrationsLoading />}>
          <IntegrationsList resourceType={resourceType} />
        </Suspense>
      </ReportingErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
