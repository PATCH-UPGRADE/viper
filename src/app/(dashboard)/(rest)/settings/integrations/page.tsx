import { PAGINATION } from "@/config/constants";
import {
  IntegrationsContainer,
  IntegrationsError,
  IntegrationsList,
  IntegrationsLoading,
} from "@/features/integrations/components/integrations";
import { paginationParamsLoader } from "@/features/integrations/server/params-loader";
import { prefetchIntegrations } from "@/features/integrations/server/prefetch";
import { prefetchWebhooks } from "@/features/webhooks/server/prefetch";
import { createListPage } from "@/lib/page-factory";

// pageSize must match useSuspenseIntegrations' override, or SSR won't
// hydrate the client query; also prefetches the sidebar's webhook count.
const prefetchConnectorsPage = async (
  params: Parameters<typeof prefetchIntegrations>[0],
) => {
  await Promise.all([
    prefetchIntegrations({ ...params, pageSize: PAGINATION.MAX_PAGE_SIZE }),
    prefetchWebhooks({}),
  ]);
};

export default createListPage({
  Container: IntegrationsContainer,
  paramsLoader: paginationParamsLoader,
  prefetch: prefetchConnectorsPage,
  List: IntegrationsList,
  Loading: IntegrationsLoading,
  Error: IntegrationsError,
});
