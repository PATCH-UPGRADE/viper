/*const Page = () => {
  return(
  <h1>Credentials</h1>
  )
}

export default Page;*/

import { IntegrationsContainer, IntegrationsList } from "@/features/integrations/components/integrations";
import { vulnerabilityIntegrationsParamsLoader } from "@/features/vulnerabilities/server/params-loader";
import { prefetchIntegrations } from "@/features/vulnerabilities/server/prefetch";
import { createListPage } from "@/lib/page-factory";


export default createListPage({
  paramsLoader: vulnerabilityIntegrationsParamsLoader,
  prefetch: prefetchIntegrations,
  Container: IntegrationsContainer,
  List: IntegrationsList,
  Loading: () => (<p>Loading...</p>),
  Error: () => (<p>Error...</p>),
});
