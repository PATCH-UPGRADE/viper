// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  processIntegrationSync: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  default: { deviceType: { findMany: mocks.findMany } },
}));
vi.mock("@/features/integrations/core/sync/upsert", () => ({
  processIntegrationSync: mocks.processIntegrationSync,
}));

const { processAssetIntegrationSync, processCrawledAssetIntegrationSync } =
  await import("../integration-sync");

const item = (deviceType: string | null) => ({
  externalId: `ext-${deviceType}`,
  ip: "10.0.0.1",
  deviceType,
});

const RUN = {
  userId: "shadow-1",
  integrationId: "int-1",
  observedAt: new Date("2026-11-01T00:00:00Z"),
};

beforeEach(() => {
  mocks.findMany
    .mockReset()
    .mockResolvedValue([{ id: "dt-pump", slug: "infusion-pump" }]);
  mocks.processIntegrationSync.mockReset().mockResolvedValue({ message: "ok" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("processCrawledAssetIntegrationSync", () => {
  it("keeps a known slug and drops an invented one, so the crawl still saves", async () => {
    await processCrawledAssetIntegrationSync(
      { items: [item("infusion-pump"), item("ct-scanner"), item(null)] },
      RUN,
    );

    const [, input] = mocks.processIntegrationSync.mock.calls[0];
    expect(
      input.items.map((i: { deviceType: string | null }) => i.deviceType),
    ).toEqual(["infusion-pump", null, null]);
    expect(console.warn).toHaveBeenCalledWith(
      "AI crawler sent an unknown deviceType, dropped it",
      { integrationId: "int-1", deviceType: "ct-scanner" },
    );
  });
});

describe("processAssetIntegrationSync", () => {
  it("leaves out a missing device, and clears it on an explicit null", async () => {
    const transform = async (device?: null) => {
      await processAssetIntegrationSync({ items: [] }, RUN, async () => {});
      const [config] = mocks.processIntegrationSync.mock.lastCall!;
      const { update } = await config.transformInputItem(
        { ...item(null), upstreamApi: null, device },
        "shadow-1",
      );
      return update.fields;
    };

    expect(await transform()).toEqual({ ip: "10.0.0.1" });
    expect(await transform(null)).toEqual({
      ip: "10.0.0.1",
      manufacturerId: null,
      productId: null,
      versionId: null,
      versionStatus: "UNKNOWN",
    });
  });
});
