import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseSuspenseAssetWorkOrders,
  mockMarkCompleteMutate,
  mockUseMarkWorkOrderComplete,
} = vi.hoisted(() => {
  const mockMarkCompleteMutate = vi.fn();
  return {
    mockMarkCompleteMutate,
    mockUseMarkWorkOrderComplete: vi.fn(() => ({
      mutate: mockMarkCompleteMutate,
      isPending: false,
    })),
    mockUseSuspenseAssetWorkOrders: vi.fn(() => ({
      data: [] as unknown[],
    })),
  };
});

vi.mock("../hooks/use-tracking", () => ({
  useSuspenseAssetWorkOrders: mockUseSuspenseAssetWorkOrders,
  useMarkWorkOrderComplete: mockUseMarkWorkOrderComplete,
}));

import { AssetWorkOrders } from "./asset-work-orders";

const sampleTicket = (overrides: Record<string, unknown> = {}) => ({
  id: "ticket-1",
  summary: "Apply firmware patch to CT Scanner gantry controller",
  status: "TO_DO",
  category: "PATCH",
  scheduledAt: new Date("2026-07-30T14:00:00Z"),
  departments: [{ id: "d-radiology", name: "Radiology", color: "purple" }],
  commentCount: 2,
  ...overrides,
});

const renderAssetWorkOrders = () =>
  render(<AssetWorkOrders assetId="asset-1" />);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMarkWorkOrderComplete.mockReturnValue({
    mutate: mockMarkCompleteMutate,
    isPending: false,
  });
});

describe("AssetWorkOrders", () => {
  it("renders the empty state when there are no open work orders", () => {
    mockUseSuspenseAssetWorkOrders.mockReturnValueOnce({ data: [] });

    renderAssetWorkOrders();

    expect(
      screen.getByText(/no open work orders for this asset/i),
    ).toBeInTheDocument();
  });

  it("renders a row per ticket with summary, status, category, dept, and scheduled date", () => {
    mockUseSuspenseAssetWorkOrders.mockReturnValueOnce({
      data: [sampleTicket()],
    });

    renderAssetWorkOrders();

    expect(
      screen.getByText(/apply firmware patch to ct scanner/i),
    ).toBeInTheDocument();
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("Patch")).toBeInTheDocument();
    expect(screen.getByText("Radiology")).toBeInTheDocument();
  });

  it("does not render a link-source badge — the ticket only needs to appear, not explain how", () => {
    mockUseSuspenseAssetWorkOrders.mockReturnValueOnce({
      data: [
        sampleTicket({
          id: "direct-ticket",
          summary: "Directly linked ticket",
        }),
        sampleTicket({
          id: "dg-ticket",
          summary: "Device-group linked ticket",
        }),
      ],
    });

    renderAssetWorkOrders();

    expect(screen.queryByText("Device group")).not.toBeInTheDocument();
  });

  it("calls markComplete with the ticket id and DONE status when clicked", async () => {
    const user = userEvent.setup();
    mockUseSuspenseAssetWorkOrders.mockReturnValueOnce({
      data: [sampleTicket({ id: "ticket-42" })],
    });

    renderAssetWorkOrders();

    await user.click(screen.getByRole("button", { name: /mark as complete/i }));

    expect(mockMarkCompleteMutate).toHaveBeenCalledWith({
      id: "ticket-42",
      status: "DONE",
    });
  });

  it("passes the assetId through to useMarkWorkOrderComplete so invalidation is scoped correctly", () => {
    mockUseSuspenseAssetWorkOrders.mockReturnValueOnce({
      data: [sampleTicket()],
    });

    renderAssetWorkOrders();

    expect(mockUseMarkWorkOrderComplete).toHaveBeenCalledWith("asset-1");
  });

  it("disables the mark-complete button while the mutation is pending", () => {
    mockUseMarkWorkOrderComplete.mockReturnValue({
      mutate: mockMarkCompleteMutate,
      isPending: true,
    });
    mockUseSuspenseAssetWorkOrders.mockReturnValueOnce({
      data: [sampleTicket()],
    });

    renderAssetWorkOrders();

    expect(
      screen.getByRole("button", { name: /mark as complete/i }),
    ).toBeDisabled();
  });

  it("renders a placeholder dash when a ticket has no departments", () => {
    mockUseSuspenseAssetWorkOrders.mockReturnValueOnce({
      data: [sampleTicket({ departments: [] })],
    });

    renderAssetWorkOrders();

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the comment count", () => {
    mockUseSuspenseAssetWorkOrders.mockReturnValueOnce({
      data: [sampleTicket({ commentCount: 5 })],
    });

    renderAssetWorkOrders();

    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
