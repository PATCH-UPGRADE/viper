import { beforeEach, describe, expect, it, vi } from "vitest";

// `match.ts` (and its imports) are server-only modules; stub it out for node tests.
vi.mock("server-only", () => ({}));

// Fake Prisma transaction client that records the calls applyDecisions makes.
const tx = {
  notificationDeviceGroupMapping: { upsert: vi.fn() },
  deviceGroup: { update: vi.fn(), upsert: vi.fn() },
};

vi.mock("@/lib/db", () => ({
  default: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import type { Candidates } from "../candidate-search";
import { applyDecisions, type Decision } from "../match";

const candidates: Candidates = {
  deviceGroups: [
    {
      extracted: {
        cpe: "cpe:2.3:o:philips:mx40",
        manufacturer: "Philips",
        modelName: "MX40",
        version: null,
      },
      matches: [
        {
          id: "dg-existing",
          cpe: "cpe:2.3:o:philips:mx40",
          manufacturer: "Philips",
          modelName: "MX40",
          version: null,
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.notificationDeviceGroupMapping.upsert.mockResolvedValue({});
  tx.deviceGroup.update.mockResolvedValue({});
  tx.deviceGroup.upsert.mockResolvedValue({ id: "dg-new" });
});

describe("applyDecisions", () => {
  it("links, updates, creates, and skips invalid decisions", async () => {
    const decisions: Decision[] = [
      {
        kind: "deviceGroup",
        op: "link",
        targetId: "dg-existing",
        confidence: "Matched",
        reasonWhy: "Same CPE",
      },
      {
        kind: "deviceGroup",
        op: "update",
        targetId: "dg-existing",
        confidence: "Matched",
        reasonWhy: "Adds version",
        fields: { version: "9.9" },
      },
      {
        kind: "deviceGroup",
        op: "create",
        confidence: "NeedsReview",
        reasonWhy: "No candidate matched",
        fields: { cpe: "cpe:2.3:o:ge:b40", manufacturer: "GE" },
      },
      // skipped: create without a cpe (no unique key)
      {
        kind: "deviceGroup",
        op: "create",
        confidence: "NeedsReview",
        reasonWhy: "No cpe available",
        fields: { manufacturer: "Mystery" },
      },
      // skipped: link to an id the search never surfaced (hallucination guard)
      {
        kind: "deviceGroup",
        op: "link",
        targetId: "dg-hallucinated",
        confidence: "Matched",
        reasonWhy: "Made up",
      },
    ];

    const summary = await applyDecisions("notif-1", decisions, candidates);

    expect(summary).toEqual({ linked: 1, updated: 1, created: 1, skipped: 2 });

    // 3 mapping writes: link + update (dg-existing) + create (dg-new)
    expect(tx.notificationDeviceGroupMapping.upsert).toHaveBeenCalledTimes(3);

    // Link mapping carries the LLM confidence + reasonWhy, keyed on the compound unique.
    expect(tx.notificationDeviceGroupMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          notificationId_deviceGroupId: {
            notificationId: "notif-1",
            deviceGroupId: "dg-existing",
          },
        },
        create: expect.objectContaining({
          confidence: "Matched",
          reasonWhy: "Same CPE",
        }),
      }),
    );

    // Update writes the new field to the existing record.
    expect(tx.deviceGroup.update).toHaveBeenCalledTimes(1);
    expect(tx.deviceGroup.update).toHaveBeenCalledWith({
      where: { id: "dg-existing" },
      data: { version: "9.9" },
    });

    // Create upserts by the unique cpe (idempotent), then maps the returned id.
    expect(tx.deviceGroup.upsert).toHaveBeenCalledTimes(1);
    expect(tx.deviceGroup.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cpe: "cpe:2.3:o:ge:b40" },
        create: expect.objectContaining({ cpe: "cpe:2.3:o:ge:b40" }),
      }),
    );
    expect(tx.notificationDeviceGroupMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          notificationId_deviceGroupId: {
            notificationId: "notif-1",
            deviceGroupId: "dg-new",
          },
        },
      }),
    );
  });

  it("never writes Confirmed confidence — coerces it to NeedsReview", async () => {
    const decisions = [
      {
        kind: "deviceGroup",
        op: "link",
        targetId: "dg-existing",
        confidence: "Confirmed", // not allowed via schema; force it through
        reasonWhy: "Should be downgraded",
      },
    ] as unknown as Decision[];

    await applyDecisions("notif-1", decisions, candidates);

    expect(tx.notificationDeviceGroupMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ confidence: "NeedsReview" }),
        update: expect.objectContaining({ confidence: "NeedsReview" }),
      }),
    );
  });
});
