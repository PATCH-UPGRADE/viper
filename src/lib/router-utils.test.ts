// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = vi.hoisted(() => {
  const db = {
    syncStatus: { findFirst: vi.fn(), upsert: vi.fn() },
    integration: { update: vi.fn() },
    apiKeyConnector: { updateMany: vi.fn() },
    $transaction: vi.fn(async (input) =>
      Array.isArray(input) ? Promise.all(input) : input(db),
    ),
  };
  return { db };
});

vi.mock("@/lib/db", () => ({ default: db }));

import { processIntegrationSync } from "./router-utils";

describe("processIntegrationSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.syncStatus.findFirst.mockResolvedValue(null);
  });

  it("runs the update hook after the item transaction commits", async () => {
    const order: string[] = [];
    const model = {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(async () => {
        order.push("item updated");
        return { id: "ticket-1" };
      }),
    };
    const mappingModel = {
      findFirst: vi.fn().mockResolvedValue({ id: "map-1", itemId: "ticket-1" }),
      create: vi.fn(),
      update: vi.fn(),
    };

    await processIntegrationSync(
      db as never,
      {
        model,
        mappingModel,
        transformInputItem: async () => ({
          createData: {},
          updateData: { status: "DONE" },
          uniqueFieldConditions: [],
          artifactsData: undefined,
        }),
        onItemUpdated: async (id) => {
          order.push(`hook ${id}`);
        },
      },
      { items: [{ vendorId: "external-1" }] },
      "user-1",
      "integration-1",
    );

    expect(order).toEqual(["item updated", "hook ticket-1"]);
  });
});
