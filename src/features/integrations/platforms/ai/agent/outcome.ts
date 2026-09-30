import { GraphRecursionError } from "@langchain/langgraph";

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
 */
export function resolveCrawl<T>(
  recorded: { called: boolean; items: T[] },
  error: unknown,
): CrawlResult<T> {
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
