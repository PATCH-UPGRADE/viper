import {
  IntegrationsContainer,
  IntegrationsError,
  IntegrationsList,
  IntegrationsLoading,
} from "@/features/integrations/components/integrations";
import { catalogEntries } from "@/features/integrations/core/catalog";
import {
  prefetchIntegrationSuggestions,
  prefetchIntegrations,
} from "@/features/integrations/server/prefetch";
import { createListPage } from "@/lib/page-factory";

// Static (derived from the registry, not from any request), so this can be
// computed once at module load rather than per-request.
const CATALOG = catalogEntries();

const prefetchConnectorsPage = async () => {
  await Promise.all([prefetchIntegrations(), prefetchIntegrationSuggestions()]);
};

export default createListPage({
  Container: IntegrationsContainer,
  // The page reads no URL params: search and the category chips are local state.
  paramsLoader: async () => undefined,
  prefetch: prefetchConnectorsPage,
  List: () => <IntegrationsList catalog={CATALOG} />,
  Loading: IntegrationsLoading,
  Error: IntegrationsError,
});
