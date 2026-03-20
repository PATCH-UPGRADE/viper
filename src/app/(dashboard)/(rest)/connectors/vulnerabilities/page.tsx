import {
  ConnectorsError,
  ConnectorsLoading,
  VulnerabilityConnectorList,
  VulnerabilityConnectorsContainer,
} from "@/features/api-key-connectors/components/connectors";
import { connectorsParamsLoader } from "@/features/api-key-connectors/server/params-loader";
import { prefetchVulnerabilityConnectors } from "@/features/api-key-connectors/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: connectorsParamsLoader,
  prefetch: prefetchVulnerabilityConnectors,
  Container: VulnerabilityConnectorsContainer,
  List: VulnerabilityConnectorList,
  Loading: ConnectorsLoading,
  Error: ConnectorsError,
});
