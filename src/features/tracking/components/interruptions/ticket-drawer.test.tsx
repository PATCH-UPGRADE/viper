import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

const { mockQuery, mockMarkSeen } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockMarkSeen: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mockQuery }));
vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    tracking: { getInterruptionDetail: { queryOptions: () => ({}) } },
  }),
}));
vi.mock("../../hooks/use-tracking", () => ({
  useMarkTicketSeen: () => ({ mutate: mockMarkSeen }),
}));
vi.mock("../ticket-detail/add-comment-form", () => ({
  AddCommentForm: () => <div>comment form</div>,
}));

import { TicketDrawer } from "./ticket-drawer";

it("opens with the ticket's details, marks it seen once, and gives focus back on close", async () => {
  mockQuery.mockReturnValue({
    data: {
      comments: [],
      seenBy: [],
      contactName: "Dr. Lee",
      whyNecessary: null,
      remediations: [{ id: "r1", narrative: "Install v2" }],
      otherDevices: [
        { id: "t2", name: "pump-2", status: "TO_DO", scheduledAt: null },
      ],
      otherDepartmentDeviceCount: 3,
    },
  });
  render(
    <TicketDrawer
      ticket={{
        id: "c1",
        summary: "Patch infusion pumps",
        status: "TO_DO",
        scheduledAt: new Date(2026, 2, 18, 9),
        assetName: "pump-1",
      }}
    >
      <button type="button">open pump-1</button>
    </TicketDrawer>,
  );
  const trigger = screen.getByRole("button", { name: "open pump-1" });
  await userEvent.click(trigger);

  expect(screen.getByText("Patch infusion pumps")).toBeTruthy();
  expect(screen.getByText("Dr. Lee")).toBeTruthy();
  expect(screen.getByText("Not provided")).toBeTruthy();
  expect(screen.getByText("pump-2")).toBeTruthy();
  expect(screen.getByText("Plus 3 devices in other departments.")).toBeTruthy();
  expect(screen.getByText(/"narrative": "Install v2"/)).toBeTruthy();
  expect(screen.getByText("Read by 0")).toBeTruthy();
  expect(mockMarkSeen).toHaveBeenCalledTimes(1);
  expect(mockMarkSeen).toHaveBeenCalledWith({ ticketId: "c1" });

  await userEvent.keyboard("{Escape}");
  expect(document.activeElement).toBe(trigger);
});
