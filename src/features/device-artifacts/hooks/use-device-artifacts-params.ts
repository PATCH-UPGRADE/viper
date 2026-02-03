import { useQueryStates } from "nuqs";
import { deviceArtifactParams } from "../params";

export const useDeviceArtifactsParams = () => {
  return useQueryStates(deviceArtifactParams);
};
