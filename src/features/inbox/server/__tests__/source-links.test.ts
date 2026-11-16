// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

import { collectMappings, linked, stripMappings } from "../source-links";

type Row = {
  id: string;
  vulnerabilityId: string;
  confidence: "NeedsReview" | "Matched" | "Confirmed" | "Rejected" | null;
};

const row = (
  id: string,
  vulnerabilityId: string,
  confidence: Row["confidence"],
): Row => ({
  id,
  vulnerabilityId,
  confidence,
});

describe("collectMappings", () => {
  it("keeps one row per entity, the first one seen", () => {
    const rows = [
      row("a", "v1", "Matched"),
      row("b", "v1", "NeedsReview"),
      row("c", "v2", null),
    ];

    const out = collectMappings(rows, (r) => r.vulnerabilityId);

    expect(out.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("hides an entity that any row rejects, even one another row still names", () => {
    const rows = [
      row("a", "v1", "Matched"),
      row("b", "v1", "Rejected"),
      row("c", "v2", "Matched"),
    ];

    const out = collectMappings(rows, (r) => r.vulnerabilityId);

    expect(out.map((r) => r.vulnerabilityId)).toEqual(["v2"]);
  });

  it("keeps a row whose confidence is null", () => {
    const out = collectMappings(
      [row("a", "v1", null)],
      (r) => r.vulnerabilityId,
    );

    expect(out).toHaveLength(1);
  });
});

describe("linked", () => {
  it("reads one kind across every source record of a notification", () => {
    const sourceLinks = [
      { sourceRecord: { vulnerabilities: [row("a", "v1", "Matched")] } },
      {
        sourceRecord: {
          vulnerabilities: [
            row("b", "v1", "Matched"),
            row("c", "v2", "Matched"),
          ],
        },
      },
      { sourceRecord: { vulnerabilities: [row("d", "v2", "Rejected")] } },
    ];

    const out = linked(sourceLinks, "vulnerabilities");

    expect(out.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("stripMappings", () => {
  it("drops the mapping rows and keeps the rest of the record", () => {
    const sourceLinks = [
      {
        sourceType: "Source",
        sourceRecord: {
          id: "src-1",
          channel: "Email",
          vulnerabilities: [row("a", "v1", "Matched")],
          deviceGroupMatchings: [],
        },
      },
    ];

    expect(stripMappings(sourceLinks)).toEqual([
      { sourceType: "Source", sourceRecord: { id: "src-1", channel: "Email" } },
    ]);
  });
});
