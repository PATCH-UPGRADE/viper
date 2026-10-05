import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const RECORD_ITEMS_TOOL = "record_items";

/**
 * The record_items tool and the items it accepted.
 *
 * The tool keeps what it accepts. A call that fails the schema never reaches
 * the tool function, so a rejected page is not kept, and its resent version
 * is kept once. A repeated `externalId` keeps its last version, so the model can
 * correct an item by recording it again.
 */
export function makeRecordItemsTool<T extends { externalId: string }>(
  itemSchema: z.ZodType<T>,
) {
  const byExternalId = new Map<string, T>();
  let called = false;

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

  return {
    tool: recordTool,
    /** `called` is false when no call was accepted, which differs from a source with no items. */
    recorded: () => ({ called, items: [...byExternalId.values()] }),
  };
}
