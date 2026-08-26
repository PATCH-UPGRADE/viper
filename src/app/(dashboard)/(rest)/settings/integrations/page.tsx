import { PAGINATION } from "@/config/constants";
import {
  IntegrationsContainer,
  IntegrationsError,
  IntegrationsList,
  IntegrationsLoading,
} from "@/features/integrations/components/integrations";
import { IntegrationsCatalog } from "@/features/integrations/components/integrations-catalog";
import { catalogEntries } from "@/features/integrations/core/catalog";
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

const CATALOG = catalogEntries();

const ConnectorsPageContent = () => (
  <div className="flex flex-col gap-10">
    <IntegrationsList />
    <IntegrationsCatalog catalog={CATALOG} />
  </div>
);

export default createListPage({
  Container: IntegrationsContainer,
  paramsLoader: paginationParamsLoader,
  prefetch: prefetchConnectorsPage,
  List: ConnectorsPageContent,
  Loading: IntegrationsLoading,
  Error: IntegrationsError,
});
