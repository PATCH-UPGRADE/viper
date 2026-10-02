import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));
vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    tracking: { getInterruptionComments: { queryOptions: () => ({}) } },
  }),
}));
vi.mock("../ticket-detail/add-comment-form", () => ({
  AddCommentForm: ({ ticketId }: { ticketId: string }) => (
    <div>comment form for {ticketId}</div>
  ),
}));

import { TicketDrawer } from "./ticket-drawer";

const ticket = {
  id: "c1",
  summary: "Patch infusion pumps",
  status: "TO_DO" as const,
  scheduledAt: new Date(2026, 2, 18, 9),
  assetName: "pump-1",
};

describe("TicketDrawer", () => {
  it("opens from its trigger with the ticket and a comment form, and gives focus back on close", async () => {
    render(
      <TicketDrawer ticket={ticket}>
        <button type="button">open pump-1</button>
      </TicketDrawer>,
    );
    const trigger = screen.getByRole("button", { name: "open pump-1" });
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Patch infusion pumps")).toBeTruthy();
    expect(screen.getByText("To Do")).toBeTruthy();
    expect(screen.getByText("comment form for c1")).toBeTruthy();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
