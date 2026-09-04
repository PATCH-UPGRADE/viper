import type { ResourceModule } from "../../../core/types";
import type { FleetConfig, FleetCreds } from "../config";
import { ACTIVITIES_URL, workOrderWebUrl } from "../urls";
import {
  type FleetActivity,
  type FleetWorkOrderItem,
  get,
  listChanged,
  toCanonical,
} from "./activities";
import { syncWorkOrders } from "./sync";
import {
  create,
  type FleetWorkOrderDraft,
  PROVISIONAL_PREFIX,
} from "./tickets";

/**
 * Fleet models a work order per piece of equipment, so an order covering N
 * assets is N calls to `create` and N mappings, one on each per-asset ticket.
 *
 * There is no `update`: Fleet's activities collection is read-only, and the
 * create endpoint is the only documented write. A status change made in VIPER
 * therefore does not travel back to Siemens.
 */
export const workOrders: ResourceModule<
  FleetWorkOrderItem,
  FleetActivity,
  FleetConfig,
  FleetCreds,
  FleetWorkOrderDraft
> = {
  sync: syncWorkOrders,

  listChanged,
  get,
  toCanonical,

  create,

  apiUrlFor: () => ACTIVITIES_URL,
  // A provisional id is ours, not Fleet's, so it names no page there. Resolve to
  // null until the sync swaps in the real ticket key, rather than a dead link.
  webUrlFor: (externalId) =>
    externalId.startsWith(PROVISIONAL_PREFIX)
      ? null
      : workOrderWebUrl(externalId),

  defaultSyncEvery: 3600,
};
