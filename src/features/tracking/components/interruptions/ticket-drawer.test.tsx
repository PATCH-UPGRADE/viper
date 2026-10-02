import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("@tanstack/react-query", () => ({ useQuery: mockQuery }));
vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    tracking: { getInterruptionDetail: { queryOptions: () => ({}) } },
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

const detail = {
  comments: [],
  contactName: "Dr. Lee",
  whyNecessary: null,
  remediations: [],
};

const open = async () => {
  render(
    <TicketDrawer ticket={ticket}>
      <button type="button">open pump-1</button>
    </TicketDrawer>,
  );
  const trigger = screen.getByRole("button", { name: "open pump-1" });
  await userEvent.click(trigger);
  return trigger;
};

describe("TicketDrawer", () => {
  it("opens from its trigger with the ticket and a comment form, and gives focus back on close", async () => {
    mockQuery.mockReturnValue({ data: detail });
    const trigger = await open();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Patch infusion pumps")).toBeTruthy();
    expect(screen.getByText("To Do")).toBeTruthy();
    expect(screen.getByText("comment form for c1")).toBeTruthy();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("drawer details", () => {
  it("shows the contact and says when no reason or remediation is on file", async () => {
    mockQuery.mockReturnValue({ data: detail });
    await open();
    expect(screen.getByText("Dr. Lee")).toBeTruthy();
    expect(screen.getByText("Not provided")).toBeTruthy();
    expect(
      screen.getByText("No remediation is linked to this ticket."),
    ).toBeTruthy();
  });

  it("shows the reason and dumps remediations as JSON", async () => {
    mockQuery.mockReturnValue({
      data: {
        ...detail,
        whyNecessary: "Closes a known vulnerability.",
        remediations: [
          {
            id: "r1",
            description: "Patch",
            narrative: "Install v2",
            sourceImpact: {},
          },
        ],
      },
    });
    await open();
    expect(screen.getByText("Closes a known vulnerability.")).toBeTruthy();
    expect(screen.getByText(/"narrative": "Install v2"/)).toBeTruthy();
  });
});
