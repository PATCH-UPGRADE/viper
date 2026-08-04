import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMutate, mockUseSuspenseAssetWorkOrders } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockUseSuspenseAssetWorkOrders: vi.fn(),
}));

vi.mock("../hooks/use-tracking", () => ({
  useUpdateTicket: () => ({ mutate: mockMutate, isPending: false }),
  useSuspenseAssetWorkOrders: mockUseSuspenseAssetWorkOrders,
}));

import { SuggestedWorkOrderModal } from "./suggested-work-order-modal";

beforeEach(() => {
  vi.clearAllMocks();
});

const HOUR_MS = 60 * 60 * 1000;
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR_MS);

type Ticket = ReturnType<
  typeof import("../hooks/use-tracking").useSuspenseAssetWorkOrders
>["data"][number];

const makeTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: "t1",
  summary: "Patch ICU monitor",
  body: null,
  status: "TO_DO",
  category: "PATCH",
  scheduledAt: new Date(),
  departments: [{ id: "d1", name: "Biomed", color: "green" }],
  commentCount: 0,
  ...overrides,
});

const renderModal = (tickets: Ticket[]) => {
  mockUseSuspenseAssetWorkOrders.mockReturnValue({ data: tickets });
  render(<SuggestedWorkOrderModal assetId="asset-1" />);
};

describe("SuggestedWorkOrderModal", () => {
  it("ignores unscheduled tickets and tickets outside the 2-day window", () => {
    renderModal([
      makeTicket({ scheduledAt: null }),
      makeTicket({ scheduledAt: hoursFromNow(49) }),
      makeTicket({ scheduledAt: hoursFromNow(-49) }),
    ]);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the closest eligible ticket with its details", () => {
    renderModal([
      makeTicket({
        summary: "Future work order",
        scheduledAt: hoursFromNow(40),
      }),
      makeTicket({
        summary: "Past work order",
        body: "Routine coolant filter swap.",
        scheduledAt: hoursFromNow(-1),
      }),
    ]);

    expect(
      screen.getByText(/are you completing this work order/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Past work order")).toBeInTheDocument();
    expect(screen.queryByText("Future work order")).not.toBeInTheDocument();
    expect(screen.getByText("Biomed")).toBeInTheDocument();
    expect(
      screen.getByText("Routine coolant filter swap."),
    ).toBeInTheDocument();
  });

  it("dismisses without mutating when 'No' is clicked", async () => {
    const user = userEvent.setup();
    renderModal([makeTicket()]);

    await user.click(screen.getByRole("button", { name: /^no$/i }));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks the ticket DONE and closes when 'Yes' is clicked", async () => {
    const user = userEvent.setup();
    renderModal([makeTicket({ id: "ticket-9" })]);

    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [payload, opts] = mockMutate.mock.calls[0];
    expect(payload).toEqual({ id: "ticket-9", status: "DONE" });

    act(opts.onSuccess);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
