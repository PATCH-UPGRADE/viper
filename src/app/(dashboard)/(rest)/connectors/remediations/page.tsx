import {
  ConnectorsError,
  ConnectorsLoading,
  RemediationConnectorList,
  RemediationConnectorsContainer,
} from "@/features/api-key-connectors/components/connectors";
import { connectorsParamsLoader } from "@/features/api-key-connectors/server/params-loader";
import { prefetchRemediationConnectors } from "@/features/api-key-connectors/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: connectorsParamsLoader,
  prefetch: prefetchRemediationConnectors,
  Container: RemediationConnectorsContainer,
  List: RemediationConnectorList,
  Loading: ConnectorsLoading,
  Error: ConnectorsError,
});
