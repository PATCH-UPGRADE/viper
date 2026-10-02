import { render, screen, within } from "@testing-library/react";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { describe, expect, it, vi } from "vitest";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("@tanstack/react-query", () => ({ useQuery: mockQuery }));
vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    tracking: { getInterruptionCalendar: { queryOptions: () => ({}) } },
  }),
}));

import { InterruptionsCalendar } from "./interruptions-calendar";

const item = (
  id: string,
  assetName: string,
  durationEstimate: number | null,
) => ({
  id,
  summary: `Patch ${assetName}`,
  status: "TO_DO",
  assetName,
  durationEstimate,
  scheduledAt: new Date(2026, 3, 1, 9),
});

const show = (search = "") =>
  render(<InterruptionsCalendar />, {
    wrapper: withNuqsTestingAdapter({
      searchParams: `?date=2026-03-31${search}`,
    }),
  });

describe("InterruptionsCalendar", () => {
  it("puts tickets under their day in a week that crosses a month end, with the estimate or 'No estimate'", () => {
    mockQuery.mockReturnValue({
      data: {
        scope: "ready",
        items: [item("c1", "pump-1", 90), item("c2", "pump-2", null)],
      },
    });
    show();

    // 2026-03-31 is a Tuesday: the week runs Mar 29 to Apr 4.
    expect(screen.getByText("Mar 29 – Apr 4, 2026")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Calendar\s*2/ })).toBeTruthy();
    const wednesday = within(
      screen.getByRole("region", { name: "Wednesday, April 1" }),
    );
    expect(wednesday.getByText("pump-1")).toBeTruthy();
    expect(wednesday.getByText("9 AM – 10:30 AM")).toBeTruthy();
    expect(wednesday.getByText(/9 AM · No estimate/)).toBeTruthy();
    expect(wednesday.getAllByText("To Do")).toHaveLength(2);
    expect(
      within(
        screen.getByRole("region", { name: "Tuesday, March 31" }),
      ).queryByText("pump-1"),
    ).toBeNull();
  });

  it("lists the same tickets in the month view", () => {
    mockQuery.mockReturnValue({
      data: { scope: "ready", items: [item("c1", "pump-1", 90)] },
    });
    show("&mode=month");

    expect(screen.getByText("March 2026")).toBeTruthy();
    expect(
      within(
        screen.getByRole("region", { name: "Wednesday, April 1" }),
      ).getByText("pump-1"),
    ).toBeTruthy();
  });

  it("explains an empty department instead of showing a blank page", () => {
    mockQuery.mockReturnValue({ data: { scope: "no-department", items: [] } });
    show();
    expect(
      screen.getByText("You're not assigned to a department"),
    ).toBeTruthy();
  });
});
