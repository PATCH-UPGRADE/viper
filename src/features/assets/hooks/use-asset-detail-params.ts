import { useQueryStates } from "nuqs";
import { assetDetailParams } from "../params";

export const useAssetDetailParams = () => {
  return useQueryStates(assetDetailParams);
};
