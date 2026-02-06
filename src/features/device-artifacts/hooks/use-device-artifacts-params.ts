import { useQueryStates } from "nuqs";
import { deviceArtifactsParams } from "../params";

export const useDeviceArtifactsParams = () => {
  return useQueryStates(deviceArtifactsParams);
};
