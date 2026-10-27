import "server-only";
import { ingestPulledWorkOrders } from "@/features/integrations/core/sync/work-order-sources";
import type { Cursor, ResourceSyncCtx, SyncOutcome } from "../../../core/types";
import type { ServiceNowConfig, ServiceNowCreds } from "../config";
import {
  listChanged,
  type ServiceNowWorkOrderItem,
  toCanonical,
} from "./change-requests";

const SERVICENOW_SOURCE_LABEL = "ServiceNow";

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

  return { cursor };
}
