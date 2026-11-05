import "server-only";
import {
  deletePulledWorkOrders,
  ingestPulledWorkOrders,
  listMappedWorkOrders,
} from "@/features/integrations/core/sync/work-order-sources";
import type { Cursor, ResourceSyncCtx, SyncOutcome } from "../../../core/types";
import type { ServiceNowConfig, ServiceNowCreds } from "../config";
import {
  changeRequestExists,
  deletedOnOf,
  listChanged,
  listDeleted,
  type ServiceNowWorkOrderItem,
  toCanonical,
  withDeletedOn,
} from "./change-requests";

const SERVICENOW_SOURCE_LABEL = "ServiceNow";

/**
 * Returns the `deletedOn` value for the next sync. A failure here must not fail
 * the change request pull, and the old value makes the next sync try again.
 */
async function removeDeletedWorkOrders(
  ctx: ResourceSyncCtx<ServiceNowConfig, ServiceNowCreds>,
): Promise<string | null> {
  try {
    const { externalIds, deletedOn } = await listDeleted(
      ctx.session,
      ctx.cursor,
    );

    const gone: string[] = [];
    for (const externalId of await listMappedWorkOrders(
      ctx.integrationId,
      externalIds,
    )) {
      if (!(await changeRequestExists(ctx.session, externalId))) {
        gone.push(externalId);
      }
    }
    await deletePulledWorkOrders(ctx.integrationId, gone);
    return deletedOn;
  } catch (error) {
    console.warn(
      `ServiceNow integration ${ctx.integrationId} could not process deleted change requests.`,
      error,
    );
    return deletedOnOf(ctx.cursor);
  }
}

export async function syncWorkOrders(
  ctx: ResourceSyncCtx<ServiceNowConfig, ServiceNowCreds>,
): Promise<SyncOutcome> {
  // A change request edited during the pull arrives twice. The later page
  // holds the newer version, so it replaces the earlier one.
  const byExternalId = new Map<string, ServiceNowWorkOrderItem>();
  let cursor: Cursor | null = ctx.cursor;
  for await (const page of listChanged(ctx.session, ctx.cursor)) {
    for (const raw of page.items) {
      const item = toCanonical(raw);
      byExternalId.set(item.externalId, item);
    }
    cursor = page.cursor;
  }

  const response = await ingestPulledWorkOrders([...byExternalId.values()], {
    integrationId: ctx.integrationId,
    integrationUserId: ctx.integrationUserId,
    sourceLabel: SERVICENOW_SOURCE_LABEL,
  });

  // Throwing makes finalize-sync record Error.
  if (response.shouldRetry) {
    throw new Error(response.message);
  }

  return {
    cursor: withDeletedOn(cursor, await removeDeletedWorkOrders(ctx)),
  };
}
