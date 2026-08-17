import {
  IntegrationsContainer,
  IntegrationsError,
  IntegrationsList,
  IntegrationsLoading,
} from "@/features/integrations/components/integrations";
import { paginationParamsLoader } from "@/features/integrations/server/params-loader";
import { prefetchIntegrations } from "@/features/integrations/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  Container: IntegrationsContainer,
  paramsLoader: paginationParamsLoader,
  prefetch: prefetchIntegrations,
  List: IntegrationsList,
  Loading: IntegrationsLoading,
  Error: IntegrationsError,
});
