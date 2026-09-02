// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockRegistry } = vi.hoisted(() => ({ mockRegistry: vi.fn() }));

vi.mock("@/features/integrations/core/registry", () => ({
  requirePlatform: mockRegistry,
}));

import { keepFileableTargets } from "../payload";
import type { ResolvedTargets } from "../targets";

// A platform that can be filed on declares both halves.
const FILEABLE = {
  createSession: async () => ({ request: async () => new Response() }),
  workOrders: { create: async () => ({ externalId: "x", raw: null }) },
};
// One that cannot: no work order module at all.
const NOT_FILEABLE = { createSession: async () => ({}) };

const target = (
  platform: string,
  assets: { id: string; hostname: string }[],
): ResolvedTargets["targets"][number] =>
  ({
    integrationId: `int-${platform}`,
    integrationName: platform,
    platform,
    responsibilities: "services these",
    managedBy: platform,
    assets: assets.map((a) => ({ ...a, ip: null, externalId: "ext" })),
    // biome-ignore lint/suspicious/noExplicitAny: a fixture, not a real target
  }) as any;

const resolved = (targets: ResolvedTargets["targets"]): ResolvedTargets => ({
  targets,
  unmanaged: [],
  unknownIds: [],
});

describe("keepFileableTargets", () => {
  it("keeps a target whose platform can be filed on", () => {
    mockRegistry.mockReturnValue(FILEABLE);

    const { targets, unmanaged } = keepFileableTargets(
      resolved([target("FLEET", [{ id: "a1", hostname: "MR-1" }])]),
    );

    expect(targets).toHaveLength(1);
    expect(unmanaged).toEqual([]);
  });

  it("moves a target's assets to unmanaged when its platform cannot file", () => {
    mockRegistry.mockReturnValue(NOT_FILEABLE);

    const { targets, unmanaged } = keepFileableTargets(
      resolved([target("PARTNER", [{ id: "a1", hostname: "MR-1" }])]),
    );

    expect(targets).toEqual([]);
    expect(unmanaged).toEqual([{ id: "a1", label: "MR-1" }]);
  });

  it("does not call an asset unmanaged when another target can file for it", () => {
    // A device serviced under two arrangements — a vendor whose platform files,
    // and a department whose platform does not. Reporting it as unmanaged would
    // tell the model the same asset is both fileable and not.
    mockRegistry.mockImplementation((p: string) =>
      p === "FLEET" ? FILEABLE : NOT_FILEABLE,
    );

    const { targets, unmanaged } = keepFileableTargets(
      resolved([
        target("FLEET", [{ id: "a1", hostname: "MR-1" }]),
        target("PARTNER", [
          { id: "a1", hostname: "MR-1" },
          { id: "a2", hostname: "CT-1" },
        ]),
      ]),
    );

    expect(targets.map((t) => t.platform)).toEqual(["FLEET"]);
    expect(unmanaged).toEqual([{ id: "a2", label: "CT-1" }]);
  });

  it("reports an asset once when two unfileable targets cover it", () => {
    mockRegistry.mockReturnValue(NOT_FILEABLE);

    const { unmanaged } = keepFileableTargets(
      resolved([
        target("PARTNER", [{ id: "a1", hostname: "MR-1" }]),
        target("AI", [{ id: "a1", hostname: "MR-1" }]),
      ]),
    );

    expect(unmanaged).toEqual([{ id: "a1", label: "MR-1" }]);
  });
});
