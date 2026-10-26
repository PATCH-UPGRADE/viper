// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

const { buildUpdatedAtFilter } = await import("../router-utils");

describe("buildUpdatedAtFilter", () => {
  it("bounds updatedAt on each side that is set", () => {
    expect(
      buildUpdatedAtFilter({
        lastUpdatedStartTime: "2026-10-20T00:00:00Z",
        lastUpdatedEndTime: "",
      }),
    ).toEqual({ updatedAt: { gte: new Date("2026-10-20T00:00:00Z") } });
    expect(
      buildUpdatedAtFilter({
        lastUpdatedStartTime: "",
        lastUpdatedEndTime: "2026-10-21T00:00:00Z",
      }),
    ).toEqual({ updatedAt: { lte: new Date("2026-10-21T00:00:00Z") } });
  });

  it("returns no filter when neither side is set", () => {
    expect(
      buildUpdatedAtFilter({
        lastUpdatedStartTime: "",
        lastUpdatedEndTime: "",
      }),
    ).toEqual({});
  });
});
