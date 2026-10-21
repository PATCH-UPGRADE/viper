import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

const { mockTicketDetailPage } = vi.hoisted(() => ({
  mockTicketDetailPage: vi.fn(),
}));

vi.mock("../ticket-detail", () => ({
  TicketDetailPage: (props: { id: string; embedded?: boolean }) => {
    mockTicketDetailPage(props);
    return <p>Work order details</p>;
  },
  TicketDetailLoading: () => <p>Loading ticket...</p>,
  TicketDetailError: () => <p>Error loading ticket</p>,
}));

import { WorkOrderModal } from "./work-order-modal";

it("opens the work order embedded in a dialog, and Escape closes it", async () => {
  const user = userEvent.setup();
  render(<WorkOrderModal workOrderId="wo-1" />);
  const button = screen.getByRole("button", { name: "View work order" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(button);
  expect(screen.getByRole("dialog")).toHaveTextContent("Work order details");
  expect(mockTicketDetailPage).toHaveBeenCalledWith({
    id: "wo-1",
    embedded: true,
  });

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(button).toHaveFocus();
});
