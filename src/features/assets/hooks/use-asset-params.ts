import { useQueryStates } from "nuqs";
import { assetDetailParams, assetsParams } from "../params";

export const useAssetsParams = () => {
  return useQueryStates(assetsParams);
};

export const useAssetDetailParams = () => {
  return useQueryStates(assetDetailParams);
};
