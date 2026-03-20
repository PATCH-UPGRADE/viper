import {
  AssetConnectorList,
  AssetConnectorsContainer,
  ConnectorsError,
  ConnectorsLoading,
} from "@/features/api-key-connectors/components/connectors";
import { connectorsParamsLoader } from "@/features/api-key-connectors/server/params-loader";
import { prefetchAssetConnectors } from "@/features/api-key-connectors/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: connectorsParamsLoader,
  prefetch: prefetchAssetConnectors,
  Container: AssetConnectorsContainer,
  List: AssetConnectorList,
  Loading: ConnectorsLoading,
  Error: ConnectorsError,
});
