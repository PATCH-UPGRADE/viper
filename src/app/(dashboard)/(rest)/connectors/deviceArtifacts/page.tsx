import {
  ConnectorsError,
  ConnectorsLoading,
  DeviceArtifactConnectorList,
  DeviceArtifactConnectorsContainer,
} from "@/features/api-key-connectors/components/connectors";
import { connectorsParamsLoader } from "@/features/api-key-connectors/server/params-loader";
import { prefetchDeviceArtifactConnectors } from "@/features/api-key-connectors/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: connectorsParamsLoader,
  prefetch: prefetchDeviceArtifactConnectors,
  Container: DeviceArtifactConnectorsContainer,
  List: DeviceArtifactConnectorList,
  Loading: ConnectorsLoading,
  Error: ConnectorsError,
});
