import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import { ErrorBoundary } from "react-error-boundary";
import { Suspense } from "react";
import { prefetchIntegrations } from "@/features/integrations/server/prefetch";
import { usePaginationParams } from "@/lib/pagination";
import {
  IntegrationsContainer,
  IntegrationsError,
  IntegrationsList,
  IntegrationsLoading,
} from "@/features/integrations/components/integrations";

const Page = async () => {
  await requireAuth();
  //const params = await usePaginationParams();
  //await prefetchIntegrations({...params, resourceType: "Asset"});

  return (
    <IntegrationsContainer resourceType="Asset">
      <HydrateClient>
        <ErrorBoundary fallback={<IntegrationsError />}>
          <Suspense fallback={<IntegrationsLoading />}>
            <IntegrationsList resourceType="Asset" />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </IntegrationsContainer>
  );
};

export default Page;
