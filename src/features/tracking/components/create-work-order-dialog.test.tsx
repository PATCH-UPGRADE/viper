import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // Radix UI + cmdk need these in jsdom
  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
});

const { mockCreateMutate, mockUseCreateTicket, mockUseAttachableAssets } =
  vi.hoisted(() => {
    const mockCreateMutate = vi.fn();
    return {
      mockCreateMutate,
      mockUseCreateTicket: vi.fn(() => ({
        mutate: mockCreateMutate,
        isPending: false,
      })),
      mockUseAttachableAssets: vi.fn(() => ({
        data: [
          {
            id: "asset-1",
            hostname: "host-loose-1",
            ip: "10.0.0.1",
            serialNumber: null,
            manufacturer: { canonicalDisplayName: "Acme" },
            product: { canonicalDisplayName: "X100", deviceType: null },
          },
          {
            id: "asset-2",
            hostname: null,
            ip: null,
            serialNumber: "63014",
            manufacturer: null,
            product: null,
          },
        ],
      })),
    };
  });

vi.mock("../hooks/use-tracking", () => ({
  useCreateTicket: mockUseCreateTicket,
  useAttachableAssets: mockUseAttachableAssets,
  useAssignableUsers: vi.fn(() => ({
    data: [
      { id: "u1", name: "Alice", email: "alice@example.com", image: null },
    ],
  })),
  useDepartments: vi.fn(() => ({
    data: [{ id: "d-radio", name: "Radiology", color: "blue" }],
  })),
}));

import { CreateWorkOrderButton } from "./create-work-order-dialog";

beforeEach(() => {
  vi.clearAllMocks();
});

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<CreateWorkOrderButton />);
  await user.click(screen.getByRole("button", { name: /new work order/i }));
  return screen.getByRole("dialog");
};

const submitForm = () => {
  const summary = screen.getByLabelText(/summary/i);
  fireEvent.submit(summary.closest("form") as HTMLFormElement);
};

describe("CreateWorkOrderButton", () => {
  it("opens a dialog with the ticket fields and an empty asset list", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    expect(
      screen.getByRole("heading", { name: /new work order/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/summary/i)).toHaveValue("");
    expect(screen.getByLabelText("Status")).toBeEnabled();
    expect(screen.getByText(/no assets linked/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create/i })).toBeEnabled();
  });

  it("does not submit without a summary", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    submitForm();

    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it("asks the picker for every asset, not the assets of a ticket", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: /add asset/i }));

    expect(mockUseAttachableAssets).toHaveBeenLastCalledWith(
      undefined,
      "",
      true,
    );
  });

  it("creates the ticket with the fields and the picked assets", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await user.type(screen.getByLabelText(/summary/i), "  Replace pump  ");
    await user.type(screen.getByLabelText(/description/i), "Swap the unit");

    await user.click(screen.getByRole("button", { name: /add asset/i }));
    await user.click(
      await screen.findByRole("option", { name: /host-loose-1/i }),
    );
    expect(screen.getByText("host-loose-1")).toBeInTheDocument();
    expect(screen.getByText(/linked assets/i)).toHaveTextContent("(1)");

    await user.click(screen.getByRole("button", { name: /add asset/i }));
    // A picked asset leaves the picker.
    expect(
      screen.queryByRole("option", { name: /host-loose-1/i }),
    ).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: /63014/ }));

    await user.click(screen.getByRole("button", { name: /remove 63014/i }));

    submitForm();

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockCreateMutate.mock.calls[0];
    expect(payload).toEqual({
      summary: "Replace pump",
      body: "Swap the unit",
      status: "TO_DO",
      category: "OTHER",
      priority: "Unsorted",
      departmentIds: [],
      assigneeId: null,
      scheduledAt: null,
      scheduledEndTime: null,
      assetIds: ["asset-1"],
    });
  });

  it("closes the dialog when the create succeeds", async () => {
    const user = userEvent.setup();
    mockCreateMutate.mockImplementation(
      (_input: unknown, options?: { onSuccess?: () => void }) =>
        options?.onSuccess?.(),
    );
    await openDialog(user);

    await user.type(screen.getByLabelText(/summary/i), "Replace pump");
    submitForm();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancels a clean form without asking", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it("keeps a dirty form open when the user declines to discard it", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await openDialog(user);
    await user.type(screen.getByLabelText(/summary/i), "Replace pump");

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Escape goes through the dialog, not the Cancel button, and asks too.
    await user.keyboard("{Escape}");
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("refuses an end time before the start time", async () => {
    const user = userEvent.setup();
    await openDialog(user);
    await user.type(screen.getByLabelText(/summary/i), "Replace pump");

    fireEvent.change(screen.getByLabelText(/scheduled for/i), {
      target: { value: "2026-05-02T10:00" },
    });
    fireEvent.change(screen.getByLabelText(/scheduled end/i), {
      target: { value: "2026-05-02T09:00" },
    });

    expect(
      screen.getByText(/end time must be after the start time/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
    submitForm();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });
});
