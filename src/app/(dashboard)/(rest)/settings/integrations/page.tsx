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

// Matches useSuspenseIntegrations' pageSize override (so this prefetch
// actually hydrates the client's query) and also prefetches the sidebar's
// webhook count, which the page needs on first paint too.
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
