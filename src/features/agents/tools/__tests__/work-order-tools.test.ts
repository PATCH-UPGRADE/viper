// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockResolve, mockKeep, mockValidate, mockPrisma } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockKeep: vi.fn(),
  mockValidate: vi.fn(),
  mockPrisma: { $transaction: vi.fn() },
}));

vi.mock("@/features/work-orders/server/targets", () => ({
  resolveWorkOrderTargets: mockResolve,
  labelFor: (a: { hostname?: string | null; id: string }) => a.hostname ?? a.id,
}));
vi.mock("@/features/work-orders/server/payload", () => ({
  keepFileableTargets: mockKeep,
  validatePayloadForModule: mockValidate,
}));
vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/features/tracking/server/asset-tickets", () => ({
  createAssetTicket: vi.fn(),
}));

import { makeWorkOrderTools } from "../work-order-tools";

const [listTargets, proposeWorkOrder] = makeWorkOrderTools("user-1");

// The factory returns a heterogeneous tuple, so destructuring gives a union of
// two tool types and `.invoke` is not callable on it. Both resolve to the
// string a tool hands back to the model, which is all these assert on.
const call = (
  tool: typeof listTargets | typeof proposeWorkOrder,
  args: Record<string, unknown>,
): Promise<string> =>
  (tool.invoke as (a: Record<string, unknown>) => Promise<string>)(args);

const fleetTarget = {
  integrationId: "int-fleet",
  integrationName: "teamplay Fleet",
  managedBy: "Siemens Healthineers",
  responsibilities: "services these",
  platform: "FLEET",
  assets: [{ id: "a1", hostname: "MR-1", ip: null, externalId: "US_1" }],
  // biome-ignore lint/suspicious/noExplicitAny: a fixture, not a real module
  module: { payloadSchema: { shape: {} } } as any,
};

const baseInput = {
  summary: "Firmware update",
  description: "Apply it.",
  category: "FIRMWARE_UPDATE" as const,
  platformPayload: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockResolvedValue({ targets: [], unmanaged: [], unknownIds: [] });
  mockValidate.mockReturnValue({ ok: true, payload: {} });
});

describe("list_work_order_targets", () => {
  it("reports ids with no asset apart from assets nothing manages", async () => {
    // An invented id is a mistake to correct. Leaving it among `unmanaged`
    // invites the model to propose a work order for a device that is not there.
    mockKeep.mockReturnValue({
      targets: [],
      unmanaged: [
        { id: "a2", label: "PUMP-1" },
        { id: "ghost", label: "ghost (no such asset)" },
      ],
      unknownIds: ["ghost"],
    });

    const out = JSON.parse(
      await call(listTargets, { assetIds: ["a2", "ghost"] }),
    );

    expect(out.unknownIds).toEqual(["ghost"]);
    expect(out.unmanaged.map((u: { id: string }) => u.id)).toEqual(["a2"]);
  });
});

describe("propose_work_order", () => {
  it("refuses an unknown id before it reasons about coverage", async () => {
    // "Fleet does not cover ghost" would be the wrong answer: the id has no
    // asset at all, and only saying so lets the model fix its call.
    mockKeep.mockReturnValue({
      targets: [fleetTarget],
      unmanaged: [],
      unknownIds: ["ghost"],
    });

    const result = await call(proposeWorkOrder, {
      ...baseInput,
      assetIds: ["a1", "ghost"],
      targetIntegrationId: "int-fleet",
    });

    expect(result).toMatch(/^REJECTED:/);
    expect(result).toMatch(/No asset exists with id ghost/);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a service window with no timezone", async () => {
    // Read as server-local, it would be stored shifted and the vendor told a
    // different hour than the approver saw.
    mockKeep.mockReturnValue({
      targets: [fleetTarget],
      unmanaged: [],
      unknownIds: [],
    });

    const result = await call(proposeWorkOrder, {
      ...baseInput,
      assetIds: ["a1"],
      targetIntegrationId: "int-fleet",
      scheduledAt: "2026-09-15T14:00:00",
    });

    expect(result).toMatch(/^REJECTED:/);
    expect(result).toMatch(/no timezone/);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("accepts a window carrying an offset or Z", async () => {
    mockKeep.mockReturnValue({
      targets: [fleetTarget],
      unmanaged: [],
      unknownIds: [],
    });
    mockPrisma.$transaction.mockResolvedValue({ id: "t-1" });

    for (const when of ["2026-09-15T14:00:00-05:00", "2026-09-15T19:00:00Z"]) {
      const result = await call(proposeWorkOrder, {
        ...baseInput,
        assetIds: ["a1"],
        targetIntegrationId: "int-fleet",
        scheduledAt: when,
      });
      expect(result).not.toMatch(/^REJECTED:/);
    }
  });
});
