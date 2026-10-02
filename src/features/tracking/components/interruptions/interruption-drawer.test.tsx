import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockParams, mockSetParams, mockDetail, mockMarkSeen } = vi.hoisted(
  () => ({
    mockParams: vi.fn(),
    mockSetParams: vi.fn(),
    mockDetail: vi.fn(),
    mockMarkSeen: vi.fn(),
  }),
);

vi.mock("../../hooks/use-interruptions-params", () => ({
  useInterruptionsParams: () => [mockParams(), mockSetParams],
}));
vi.mock("../../hooks/use-interruptions", () => ({
  useInterruptionDetail: mockDetail,
  useRescheduleRequests: () => ({ data: [] }),
  useCreateRescheduleRequest: () => ({ mutate: vi.fn(), isPending: false }),
  useResolveRescheduleRequest: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../hooks/use-tracking", () => ({
  useMarkTicketSeen: () => ({ mutate: mockMarkSeen }),
}));
vi.mock("../ticket-detail/add-comment-form", () => ({
  AddCommentForm: () => <div>comment form</div>,
}));

import { InterruptionDrawer } from "./interruption-drawer";

const detail = {
  id: "c1",
  status: "TO_DO",
  scheduledAt: new Date(2026, 2, 18, 9),
  durationEstimate: null,
  workOrder: { summary: "Patch infusion pumps" },
  assetName: "pump-1",
  otherDevices: [
    { id: "c2", name: "pump-2", status: "TO_DO", scheduledAt: null },
  ],
  otherDepartmentDeviceCount: 3,
  remediations: [],
  comments: [],
  seenBy: [],
};

const dialog = () => within(screen.getByRole("dialog"));

beforeEach(() => {
  vi.clearAllMocks();
  mockParams.mockReturnValue({ ticket: "c1" });
  mockDetail.mockReturnValue({ data: detail, isError: false });
});

describe("InterruptionDrawer", () => {
  it("shows the details and marks the ticket seen once, even after a refresh", () => {
    const { rerender } = render(<InterruptionDrawer />);

    expect(dialog().getByText("Patch infusion pumps")).toBeTruthy();
    expect(dialog().getByText("No estimate")).toBeTruthy();
    expect(dialog().getByText("pump-2")).toBeTruthy();
    expect(
      dialog().getByText("Plus 3 devices in other departments."),
    ).toBeTruthy();

    mockDetail.mockReturnValue({ data: { ...detail }, isError: false });
    rerender(<InterruptionDrawer />);
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockMarkSeen).toHaveBeenCalledWith({ ticketId: "c1" });
  });

  it("dumps remediations as JSON, or says there are none", () => {
    const { rerender } = render(<InterruptionDrawer />);
    expect(
      dialog().getByText("No remediation is linked to this ticket."),
    ).toBeTruthy();

    const remediations = [
      {
        id: "r1",
        description: "Patch",
        narrative: "Install v2",
        sourceImpact: {},
      },
    ];
    mockDetail.mockReturnValue({
      data: { ...detail, remediations },
      isError: false,
    });
    rerender(<InterruptionDrawer />);
    expect(dialog().getByText(/"narrative": "Install v2"/)).toBeTruthy();
  });

  it("marks nothing seen for a ticket the server won't show, and clears the param on close", async () => {
    mockDetail.mockReturnValue({ data: undefined, isError: true });
    render(<InterruptionDrawer />);
    expect(screen.getByText("This ticket isn't available.")).toBeTruthy();
    expect(mockMarkSeen).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(mockSetParams).toHaveBeenCalledWith({ ticket: null });
  });
});
