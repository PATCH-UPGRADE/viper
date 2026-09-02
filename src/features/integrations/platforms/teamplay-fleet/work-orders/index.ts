import type { WorkOrderModule } from "../../../core/types";
import type { FleetConfig, FleetCreds } from "../config";
import { ACTIVITIES_URL, workOrderWebUrl } from "../urls";
import {
  type FleetActivity,
  get,
  listChanged,
  toCanonical,
} from "./activities";
import { fleetWorkOrderPayloadSchema } from "./payload";
import { syncWorkOrders } from "./sync";
import {
  assertSubmittable,
  create,
  type FleetWorkOrderDraft,
  PROVISIONAL_PREFIX,
  toDraft,
} from "./tickets";

/**
 * Fleet models a work order per piece of equipment, so an order covering N
 * assets is N calls to `create` and N mappings, one on each per-asset ticket.
 *
 * There is no `update`: Fleet's activities collection is read-only, and the
 * create endpoint is the only documented write. A status change made in VIPER
 * therefore does not travel back to Siemens.
 */
export const workOrders: WorkOrderModule<
  FleetActivity,
  FleetConfig,
  FleetCreds,
  FleetWorkOrderDraft
> = {
  sync: syncWorkOrders,

  listChanged,
  get,
  toCanonical,

  // The push half. `payloadSchema` is what a model fills in, `toDraft` joins
  // that to what VIPER already knows, and `create` files the result.
  payloadSchema: fleetWorkOrderPayloadSchema,
  toDraft,
  assertSubmittable,
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
