import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  IntegrationsError,
  IntegrationsList,
  IntegrationsLoading,
} from "@/features/integrations/components/integrations";
import { paginationParamsLoader } from "@/features/integrations/server/params-loader";
import { prefetchIntegrations } from "@/features/integrations/server/prefetch";
import {
  integrationsMapping,
  isValidIntegrationKey,
} from "@/features/integrations/types";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

interface PageProps {
  params: Promise<{
    resourceTypeUrl: string;
  }>;
}

const Page = async ({ params }: PageProps) => {
  await requireAuth();
  const { resourceTypeUrl, ...searchParams } = await params;

  // Validate resourceType
  if (!isValidIntegrationKey(resourceTypeUrl)) {
    notFound();
  }

  const resourceType = integrationsMapping[resourceTypeUrl].type;
  const paginationParams = await paginationParamsLoader(searchParams);
  await prefetchIntegrations({ ...paginationParams, resourceType });

  return (
    <HydrateClient>
      <ErrorBoundary fallback={<IntegrationsError />}>
        <Suspense fallback={<IntegrationsLoading />}>
          <IntegrationsList resourceType={resourceType} />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
