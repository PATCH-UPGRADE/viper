// @vitest-environment node
import { GraphRecursionError } from "@langchain/langgraph";
import { NonRetriableError } from "inngest";
import { describe, expect, it } from "vitest";
import { resolveCrawl } from "../outcome";

const recorded = { called: true, items: ["a", "b"] };
const nothing = { called: false, items: [] };

describe("resolveCrawl", () => {
  it("returns a finished crawl as complete", () => {
    expect(resolveCrawl(recorded, undefined)).toEqual({ items: ["a", "b"] });
  });

  it("keeps the items of a crawl that hit the step limit, with the reason", () => {
    const result = resolveCrawl(recorded, new GraphRecursionError("limit"));

    expect(result.items).toEqual(["a", "b"]);
    expect(result.incomplete).toBe(
      "The AI crawler reached its step limit, so later pages were not synced. It recorded 2 item(s) before it stopped.",
    );
  });

  it("keeps the items of a crawl that failed partway, with the error", () => {
    const result = resolveCrawl(recorded, new Error("529 overloaded"));

    expect(result.items).toEqual(["a", "b"]);
    expect(result.incomplete).toBe(
      "The AI crawler failed: 529 overloaded It recorded 2 item(s) before it stopped.",
    );
  });

  it("throws when the crawl finished without recording", () => {
    expect(() => resolveCrawl(nothing, undefined)).toThrow(
      "The AI crawler stopped without recording any items",
    );
  });

  it("throws the step limit when nothing was recorded", () => {
    expect(() =>
      resolveCrawl(nothing, new GraphRecursionError("limit")),
    ).toThrow("reached its step limit");
  });

  it("rethrows the original error when nothing was recorded", () => {
    const error = new Error("401 invalid x-api-key");
    expect(() => resolveCrawl(nothing, error)).toThrow(error);
  });

  // Ids that can move between syncs can update the wrong record, so nothing
  // from such a crawl is saved, not even what it already recorded.
  it("throws a non-retryable error and saves nothing when the source has no stable id", () => {
    const run = () =>
      resolveCrawl(
        { ...recorded, noStableId: "Rows have no id field." },
        undefined,
      );

    expect(run).toThrow(NonRetriableError);
    expect(run).toThrow(/no stable id for its items: Rows have no id field\./);
  });

  it("reports no stable id even when the crawl also failed", () => {
    expect(() =>
      resolveCrawl(
        { ...nothing, noStableId: "Rows have no id field." },
        new Error("overloaded"),
      ),
    ).toThrow(NonRetriableError);
  });
});
