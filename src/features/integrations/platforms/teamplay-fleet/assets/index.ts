import type { ResourceModule } from "../../../core/types";
import type { FleetConfig, FleetCreds } from "../config";
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

  defaultSyncEvery: 86400,
};
