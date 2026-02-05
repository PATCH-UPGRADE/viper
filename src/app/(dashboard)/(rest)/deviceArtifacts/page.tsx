import {
  DeviceArtifactsContainer,
  DeviceArtifactsError,
  DeviceArtifactsList,
  DeviceArtifactsLoading,
} from "@/features/device-artifacts/components/device-artifacts";
import { deviceArtifactsParamsLoader } from "@/features/device-artifacts/server/params-loader";
import { prefetchDeviceArtifacts } from "@/features/device-artifacts/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: deviceArtifactsParamsLoader,
  prefetch: prefetchDeviceArtifacts,
  Container: DeviceArtifactsContainer,
  List: DeviceArtifactsList,
  Loading: DeviceArtifactsLoading,
  Error: DeviceArtifactsError,
});
