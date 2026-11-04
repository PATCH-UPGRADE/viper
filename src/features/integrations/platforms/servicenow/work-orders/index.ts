import { z } from "zod";
import type { WorkOrderDraftInput, WorkOrderModule } from "../../../core/types";
import type { ServiceNowConfig, ServiceNowCreds } from "../config";
import { recordApiUrl, recordWebUrl } from "../urls";
import {
  CHANGE_REQUEST_TABLE,
  type ChangeRequest,
  get,
  listChanged,
  toCanonical,
  update,
} from "./change-requests";
import { syncWorkOrders } from "./sync";

const FILING_NOT_SUPPORTED =
  "VIPER cannot file work orders in ServiceNow yet. Track this work order in VIPER instead.";

/**
 * VIPER does not file new change requests on ServiceNow. Core treats any
 * platform with a work order module as a filing target, so the module must
 * still declare `create`, `toDraft` and `payloadSchema`. `assertSubmittable`
 * refuses every payload before anything is claimed or sent.
 */
export const workOrders: WorkOrderModule<
  ChangeRequest,
  ServiceNowConfig,
  ServiceNowCreds,
  WorkOrderDraftInput
> = {
  sync: syncWorkOrders,

  listChanged,
  get,
  toCanonical,

  payloadSchema: z.object({}),
  toDraft: (input) => input,
  assertSubmittable: () => {
    throw new Error(FILING_NOT_SUPPORTED);
  },
  create: async () => {
    throw new Error(FILING_NOT_SUPPORTED);
  },

  update: (session, externalId, patch) => update(session, externalId, patch),
  pushedFields: ["summary", "description", "scheduledAt", "scheduledEndTime"],
  // ServiceNow owns the state of a change request.
  lockedFields: ["status"],

  apiUrlFor: (externalId, config) =>
    recordApiUrl(config.instanceUrl, CHANGE_REQUEST_TABLE, externalId),
  webUrlFor: (externalId, config) =>
    recordWebUrl(config.instanceUrl, CHANGE_REQUEST_TABLE, externalId),

  defaultSyncEvery: 3600,
};
