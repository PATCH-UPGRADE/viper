import { GraphRecursionError } from "@langchain/langgraph";
import { NonRetriableError } from "inngest";

export interface CrawlResult<T> {
  items: T[];
  /** Why the crawl stopped early. The items are still worth saving. */
  incomplete?: string;
}

/**
 * Turn what the crawl recorded, and how it ended, into a result.
 *
 * A crawl that stops early keeps what it recorded, because
 * processIntegrationSync only upserts. The reason goes back to the caller so
 * the sync is not reported as complete. A crawl that recorded nothing throws:
 * there is nothing to save. An empty record_items call is a real answer: the
 * source has nothing to sync.
 *
 * A source with no stable id throws NonRetriableError and saves nothing, not
 * even the items already recorded: their ids can point to a different item on
 * the next sync, so saving them can update the wrong record.
 */
export function resolveCrawl<T>(
  recorded: { called: boolean; items: T[]; noStableId?: string },
  error: unknown,
): CrawlResult<T> {
  if (recorded.noStableId !== undefined) {
    throw new NonRetriableError(
      `The AI crawler stopped because the source has no stable id for its items: ${recorded.noStableId} Name a stable id field in the instructions.`,
    );
  }

  const reason =
    error === undefined
      ? undefined
      : error instanceof GraphRecursionError
        ? "The AI crawler reached its step limit, so later pages were not synced."
        : `The AI crawler failed: ${error instanceof Error ? error.message : String(error)}`;

  if (!recorded.called) {
    if (reason === undefined) {
      throw new Error("The AI crawler stopped without recording any items");
    }
    if (error instanceof GraphRecursionError) {
      throw new Error(`${reason} It recorded no items.`);
    }
    throw error;
  }

  return reason === undefined
    ? { items: recorded.items }
    : {
        items: recorded.items,
        incomplete: `${reason} It recorded ${recorded.items.length} item(s) before it stopped.`,
      };
}
