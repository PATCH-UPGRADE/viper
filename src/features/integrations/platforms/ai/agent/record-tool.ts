import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const RECORD_ITEMS_TOOL = "record_items";
export const REPORT_NO_STABLE_ID_TOOL = "report_no_stable_id";

/**
 * The record_items and report_no_stable_id tools, and what they accepted.
 *
 * record_items keeps what it accepts. A call that fails the schema never
 * reaches the tool function, so a rejected page is not kept, and its resent
 * version is kept once. A repeated `externalId` keeps its last version, so the
 * model can correct an item by recording it again.
 */
export function makeRecorder<T extends { externalId: string }>(
  itemSchema: z.ZodType<T>,
) {
  const byExternalId = new Map<string, T>();
  let called = false;
  let noStableId: string | undefined;

  const recordTool = tool(
    async ({ items }) => {
      called = true;
      for (const item of items) byExternalId.set(item.externalId, item);
      return `Recorded ${items.length} item(s).`;
    },
    {
      name: RECORD_ITEMS_TOOL,
      description:
        "Record items for VIPER. Call it once for each page of results, with the items from that page. If the source has no items, call it once with an empty list.",
      schema: z.object({ items: z.array(itemSchema) }),
    },
  );

  const reportTool = tool(
    async ({ reason }) => {
      noStableId = reason;
      return "Reported. Stop the crawl now, and do not record more items.";
    },
    {
      name: REPORT_NO_STABLE_ID_TOOL,
      description:
        "Report that the source has no stable unique id for its items, so VIPER cannot sync them without making duplicates. Call it instead of recording items, then stop.",
      schema: z.object({
        reason: z
          .string()
          .describe(
            "Which fields you checked, and why none of them identify an item across syncs.",
          ),
      }),
    },
  );

  return {
    recordTool,
    reportTool,
    /**
     * `called` is false when no record_items call was accepted, which differs
     * from a source with no items. `noStableId` holds the reason when the model
     * reported that the source has no stable id.
     */
    recorded: () => ({
      called,
      items: [...byExternalId.values()],
      noStableId,
    }),
  };
}
