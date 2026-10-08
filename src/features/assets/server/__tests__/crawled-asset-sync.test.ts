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

const { processCrawledAssetIntegrationSync } = await import(
  "../integration-sync"
);

const item = (deviceType: string | null) => ({
  externalId: `ext-${deviceType}`,
  ip: "10.0.0.1",
  deviceType,
});

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
      "shadow-1",
      "int-1",
    );

    const [, , input] = mocks.processIntegrationSync.mock.calls[0];
    expect(
      input.items.map((i: { deviceType: string | null }) => i.deviceType),
    ).toEqual(["infusion-pump", null, null]);
    expect(console.warn).toHaveBeenCalledWith(
      "AI crawler sent an unknown deviceType, dropped it",
      { integrationId: "int-1", deviceType: "ct-scanner" },
    );
  });
});
