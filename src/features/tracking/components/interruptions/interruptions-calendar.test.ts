import { describe, expect, it } from "vitest";
import { layout } from "./interruptions-calendar";

type LayoutItem = Parameters<typeof layout>[1][number];

const day = new Date(2026, 2, 3);

// An event on the test day at hour:minute that lasts `minutes`.
const event = (hour: number, minute: number, minutes: number, date = day) =>
  ({
    scheduledAt: new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hour,
      minute,
    ),
    durationEstimate: minutes,
  }) as LayoutItem;

const lanesOf = (items: LayoutItem[]) =>
  layout(day, items).map((block) => block.lanes);

describe("calendar layout", () => {
  it("gives a lone block the full width", () => {
    expect(lanesOf([event(9, 0, 60)])).toEqual([1]);
  });

  it("splits two overlapping blocks into two lanes", () => {
    expect(lanesOf([event(9, 0, 60), event(9, 30, 60)])).toEqual([2, 2]);
  });

  it("keeps a lone block full width next to an overlapping pair", () => {
    const blocks = layout(day, [
      event(8, 0, 30),
      event(13, 0, 60),
      event(13, 30, 60),
    ]);
    expect(blocks.map((block) => block.lanes)).toEqual([1, 2, 2]);
  });

  it("keeps a chain of overlaps in one cluster", () => {
    // A overlaps B and B overlaps C, but A ends before C starts.
    const blocks = layout(day, [
      event(9, 0, 60),
      event(9, 30, 60),
      event(10, 10, 60),
    ]);
    expect(blocks.map((block) => block.lanes)).toEqual([2, 2, 2]);
    expect(blocks.map((block) => block.lane)).toEqual([0, 1, 0]);
  });

  it("continues an event past midnight at the top of the next day", () => {
    const yesterday = new Date(2026, 2, 2);
    const blocks = layout(day, [
      event(23, 30, 60, yesterday),
      event(0, 10, 30),
    ]);
    expect(
      blocks.map((block) => [block.start, block.len, block.lanes]),
    ).toEqual([
      [0, 30, 2],
      [10, 30, 2],
    ]);
  });
});
