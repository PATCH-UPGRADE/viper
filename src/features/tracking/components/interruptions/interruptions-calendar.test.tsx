import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { mockCalendar, mockSetParams } = vi.hoisted(() => ({
  mockCalendar: vi.fn(),
  mockSetParams: vi.fn(),
}));

vi.mock("../../hooks/use-interruptions-params", () => ({
  useInterruptionsParams: () => [
    { mode: "week", date: "2026-03-18" },
    mockSetParams,
  ],
  useOpenTicket: () => (id: string) => mockSetParams({ ticket: id }),
}));
vi.mock("../../hooks/use-interruptions", () => ({
  useInterruptionCalendar: mockCalendar,
}));

import { InterruptionsCalendar } from "./interruptions-calendar";

const item = (overrides = {}) => ({
  id: "c1",
  summary: "Patch pumps — pump-1",
  status: "TO_DO",
  scheduledAt: new Date(2026, 2, 18, 9),
  durationEstimate: null,
  assetName: "pump-1",
  unread: true,
  ...overrides,
});

const show = (items: object[]) =>
  mockCalendar.mockReturnValue({
    data: { scope: "ready", items, assetTicketCount: items.length },
    isError: false,
    isPlaceholderData: false,
  });

describe("InterruptionsCalendar", () => {
  it("says 'No estimate' without one, and spells out status and read state", () => {
    show([
      item(),
      item({
        id: "c2",
        assetName: "pump-2",
        durationEstimate: 90,
        unread: false,
      }),
    ]);
    render(<InterruptionsCalendar />);

    const [noEstimate, withEstimate] = screen.getAllByRole("button", {
      name: /Patch pumps/,
    });
    expect(noEstimate.textContent).toContain("No estimate");
    expect(noEstimate.getAttribute("aria-label")).toMatch(
      /pump-1.*No estimate.*To Do.*unread/,
    );
    expect(withEstimate.textContent).toContain("9 AM – 10:30 AM");
    expect(withEstimate.getAttribute("aria-label")).toMatch(
      /1 h 30 min.*, read$/,
    );
  });

  it("opens a ticket by setting the ticket param", async () => {
    show([item()]);
    render(<InterruptionsCalendar />);
    await userEvent.click(screen.getByRole("button", { name: /pump-1/ }));
    expect(mockSetParams).toHaveBeenCalledWith({ ticket: "c1" });
  });

  it("explains an empty department instead of showing a blank page", () => {
    mockCalendar.mockReturnValue({
      data: { scope: "no-department", items: [], assetTicketCount: 0 },
      isError: false,
      isPlaceholderData: false,
    });
    render(<InterruptionsCalendar />);
    expect(
      screen.getByText("You're not assigned to a department"),
    ).toBeTruthy();
  });
});
