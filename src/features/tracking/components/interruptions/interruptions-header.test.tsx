import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockParams } = vi.hoisted(() => ({ mockParams: vi.fn() }));

vi.mock("../../hooks/use-interruptions-params", () => ({
  useInterruptionsParams: () => [mockParams(), vi.fn()],
}));
vi.mock("../../hooks/use-interruptions", () => {
  const data = {
    data: { scope: "ready", items: [], groups: [], assetTicketCount: 2 },
  };
  return {
    useInterruptionCalendar: () => data,
    useInterruptionList: () => data,
  };
});

import { InterruptionsHeader } from "./interruptions-header";

describe("InterruptionsHeader", () => {
  it("offers the calendar's range controls", () => {
    mockParams.mockReturnValue({
      view: "calendar",
      mode: "week",
      date: "2026-03-18",
    });
    render(<InterruptionsHeader />);
    expect(screen.getByRole("button", { name: "Next week" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /month/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Calendar\s*2/ })).toBeTruthy();
  });
});
