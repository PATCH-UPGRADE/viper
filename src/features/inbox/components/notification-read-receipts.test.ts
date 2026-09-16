// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationReadReceipt } from "../types";
import { groupReceiptsByDay } from "./shared";

const receipt = (id: string, readAt: string): NotificationReadReceipt => ({
  id,
  readAt: new Date(readAt),
  user: { id: `user-${id}`, name: `User ${id}`, image: null, department: null },
});

const dayStartOf = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();

describe("groupReceiptsByDay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns no groups for no receipts", () => {
    expect(groupReceiptsByDay([])).toEqual([]);
  });

  it("puts receipts from the same day in one group", () => {
    const groups = groupReceiptsByDay([
      receipt("a", "2026-09-16T10:04:00"),
      receipt("b", "2026-09-16T09:37:00"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].receipts.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("orders the groups newest day first", () => {
    const groups = groupReceiptsByDay([
      receipt("c", "2026-09-14T09:00:00"),
      receipt("a", "2026-09-16T10:04:00"),
      receipt("b", "2026-09-15T21:48:00"),
    ]);

    expect(groups.map((g) => g.dayStart)).toEqual([
      dayStartOf("2026-09-16"),
      dayStartOf("2026-09-15"),
      dayStartOf("2026-09-14"),
    ]);
  });

  it("keeps the order the receipts arrive in inside a group", () => {
    const groups = groupReceiptsByDay([
      receipt("late", "2026-09-16T11:00:00"),
      receipt("early", "2026-09-16T08:00:00"),
    ]);

    expect(groups[0].receipts.map((r) => r.id)).toEqual(["late", "early"]);
  });

  it("does not merge the same calendar day from different years", () => {
    const groups = groupReceiptsByDay([
      receipt("a", "2026-03-04T10:00:00"),
      receipt("b", "2025-03-04T10:00:00"),
    ]);

    expect(groups.map((g) => g.dayStart)).toEqual([
      dayStartOf("2026-03-04"),
      dayStartOf("2025-03-04"),
    ]);
  });
});
