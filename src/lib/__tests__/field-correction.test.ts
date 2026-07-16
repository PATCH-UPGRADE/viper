import { describe, expect, it, vi } from "vitest";
import { recordFieldCorrections } from "../field-correction";

function makeMockTx() {
  return {
    fieldCorrection: {
      createMany: vi.fn(),
    },
  } as any;
}

describe("recordFieldCorrection", () => {
  it("no ops when nothing changed", async () => {
    const tx = makeMockTx();
    await recordFieldCorrections(tx, {
      targetType: "Notification",
      targetId: "notification_1",
      userId: "user_1",
      before: { type: "Advisory", priority: "Critical" },
      after: { type: "Advisory", priority: "Critical" },
    });
    expect(tx.fieldCorrection.createMany).not.toHaveBeenCalled();
  });

  it("writes one row per changed fiekd when multiple fields change in one call", async () => {
    const tx = makeMockTx();
    await recordFieldCorrections(tx, {
      targetType: "Notification",
      targetId: "notification_1",
      userId: "user_1",
      reason: "it is a recall",
      before: { type: "Advisory", priority: "Critical" },
      after: { type: "Recall", priority: "High" },
    });
    expect(tx.fieldCorrection.createMany).toHaveBeenCalledTimes(1);

    const { data } = tx.fieldCorrection.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "type",
          fromValue: "Advisory",
          toValue: "Recall",
          reason: "it is a recall",
          targetType: "Notification",
          targetId: "notification_1",
          userId: "user_1",
        }),
        expect.objectContaining({
          field: "priority",
          fromValue: "Critical",
          toValue: "High",
        }),
      ]),
    );
  });
});
