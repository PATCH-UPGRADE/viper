// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { requestOrigin, sourceRecordOrigin } from "../origin";

vi.mock("server-only", () => ({}));
const { findUniqueOrThrow } = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  default: { sourceRecord: { findUniqueOrThrow } },
}));
vi.mock("@/lib/automation-user", () => ({
  getAutomationUser: async () => ({ id: "automation" }),
}));

describe("requestOrigin", () => {
  const user = { id: "u1" };

  it("is API_CLIENT only with an API key", () => {
    const manual = { source: "MANUAL", actorUserId: "u1" };
    expect(requestOrigin({ user })).toEqual(manual);
    expect(requestOrigin({ user, key: undefined })).toEqual(manual);
    expect(requestOrigin({ user, key: { id: "k1" } })).toEqual({
      source: "API_CLIENT",
      actorUserId: "u1",
    });
  });
});

describe("sourceRecordOrigin", () => {
  const observedAt = new Date("2026-11-01");

  it.each([
    ["Email", "EMAIL"],
    ["TA4", "API_CLIENT"],
  ])("maps %s to %s", async (channel, source) => {
    findUniqueOrThrow.mockResolvedValue({ channel, observedAt, mapping: null });
    expect(await sourceRecordOrigin("s1")).toEqual({
      source,
      actorUserId: "automation",
    });
  });

  it("names the integration, with the time of the record", async () => {
    findUniqueOrThrow.mockResolvedValue({
      channel: "Integration",
      observedAt,
      mapping: { integration: { id: "i1", name: "Fleet" } },
    });
    expect(await sourceRecordOrigin("s1")).toEqual({
      source: "INTEGRATION",
      integrationId: "i1",
      integrationName: "Fleet",
      observedAt,
      actorUserId: "automation",
    });
  });
});
