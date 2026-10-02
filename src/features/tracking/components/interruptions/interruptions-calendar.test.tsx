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

const show = () =>
  render(<InterruptionsCalendar />, {
    wrapper: withNuqsTestingAdapter({ searchParams: "?date=2026-03-31" }),
  });

describe("InterruptionsCalendar", () => {
  it("puts each ticket under its day, in a week that crosses a month end", () => {
    mockQuery.mockReturnValue({
      data: {
        scope: "ready",
        items: [
          {
            id: "c1",
            summary: "Patch",
            status: "TO_DO",
            assetName: "pump-1",
            scheduledAt: new Date(2026, 3, 1, 9),
          },
        ],
      },
    });
    show();

    // 2026-03-31 is a Tuesday: the week runs Mar 29 to Apr 4.
    expect(screen.getByText("Mar 29 – Apr 4, 2026")).toBeTruthy();
    const wednesday = within(
      screen.getByRole("region", { name: "Wednesday, April 1" }),
    );
    expect(wednesday.getByText("pump-1")).toBeTruthy();
    expect(wednesday.getByText("9:00 AM")).toBeTruthy();
    expect(wednesday.getByText("To Do")).toBeTruthy();
    expect(
      within(
        screen.getByRole("region", { name: "Tuesday, March 31" }),
      ).queryByText("pump-1"),
    ).toBeNull();
  });

  it("explains an empty department instead of showing a blank page", () => {
    mockQuery.mockReturnValue({ data: { scope: "no-department", items: [] } });
    show();
    expect(
      screen.getByText("You're not assigned to a department"),
    ).toBeTruthy();
  });
});
