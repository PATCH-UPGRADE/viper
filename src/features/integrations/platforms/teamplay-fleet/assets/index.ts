import type { ResourceModule } from "../../../core/types";
import { BASE_URL, type FleetConfig, type FleetCreds } from "../config";
import { EQUIPMENTS_URL } from "../urls";
import {
  type FleetAssetItem,
  type FleetEquipment,
  get,
  listChanged,
  toCanonical,
} from "./equipments";
import { syncAssets } from "./sync";

export const assets: ResourceModule<
  FleetAssetItem,
  FleetEquipment,
  FleetConfig,
  FleetCreds
> = {
  sync: syncAssets,

  listChanged,
  get,
  toCanonical,

  apiUrlFor: () => EQUIPMENTS_URL,

  webUrlFor: (externalId) =>
    `${BASE_URL}/equipment/${encodeURIComponent(externalId)}/info`,

  defaultSyncEvery: 86400,
};
