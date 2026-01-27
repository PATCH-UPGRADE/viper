import { createLoader } from "nuqs/server";
import { assetDetailParams, assetsParams } from "../params";

export const assetsParamsLoader = createLoader(assetsParams);

export const assetDetailParamsLoader = createLoader(assetDetailParams);
