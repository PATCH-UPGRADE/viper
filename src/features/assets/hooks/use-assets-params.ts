import { useQueryStates } from "nuqs";
import { assetsParams } from "../params";

export const useAssetsParams = () => {
  return useQueryStates(assetsParams);
};
