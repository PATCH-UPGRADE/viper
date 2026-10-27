import "server-only";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import { recordWorkOrderSources } from "@/features/integrations/core/sync/work-order-sources";
import { recordCreationActivity } from "@/features/tracking/server/activities";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
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
  const items = [...byExternalId.values()];

  const response = await processIntegrationSync(
    prisma,
    {
      model: prisma.workOrderTicket,
      mappingModel: prisma.externalWorkOrderMapping,
      onItemCreated: (id: string) => recordCreationActivity(id),
      // finalize-sync already records this attempt. A second write double-counts
      // consecutiveFailures.
      shouldRecordSyncOutcome: false,
      transformInputItem: async (
        item: ServiceNowWorkOrderItem,
        userId: string,
      ) => {
        const fields = {
          summary: item.summary,
          body: item.body,
          status: item.status,
          category: item.category,
          scheduledAt: item.scheduledAt ? new Date(item.scheduledAt) : null,
          scheduledEndTime: item.scheduledEndTime
            ? new Date(item.scheduledEndTime)
            : null,
          sourceLabel: SERVICENOW_SOURCE_LABEL,
        };
        return {
          createData: { ...fields, creatorId: userId },
          updateData: fields,
          // A work order has no natural business key, so with no external
          // mapping there is nothing to match on and the ticket is new.
          uniqueFieldConditions: [],
          artifactsData: undefined,
        };
      },
    },
    { items },
    ctx.integrationUserId,
    ctx.integrationId,
    ResourceType.WorkOrder,
  );
  await recordWorkOrderSources(items, ctx.integrationId);

  // Throwing makes finalize-sync record Error.
  if (response.shouldRetry) {
    throw new Error(response.message);
  }

  return { cursor };
}
