import { render, screen, within } from "@testing-library/react";
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

const {
  mockMutate,
  mockAddCommentMutate,
  mockUseUpdateTicket,
  mockUseAssignableUsers,
  mockUseDepartments,
  mockUseAddTicketComment,
  mockUseSuspenseTrackingTicket,
  mockUseSession,
  mockMarkSeenMutate,
  mockUseMarkTicketSeen,
  mockAttachMutate,
  mockDetachMutate,
  mockUseAttachChild,
  mockUseDetachChild,
  mockUseAttachableChildren,
  mockAttachAssetMutate,
  mockDetachAssetMutate,
  mockUseAttachAsset,
  mockUseDetachAsset,
  mockUseAttachableAssets,
} = vi.hoisted(() => {
  const mockMutate = vi.fn();
  const mockAddCommentMutate = vi.fn();
  const mockMarkSeenMutate = vi.fn();
  const mockAttachMutate = vi.fn();
  const mockDetachMutate = vi.fn();
  const mockAttachAssetMutate = vi.fn();
  const mockDetachAssetMutate = vi.fn();
  return {
    mockMutate,
    mockAddCommentMutate,
    mockMarkSeenMutate,
    mockAttachMutate,
    mockDetachMutate,
    mockAttachAssetMutate,
    mockDetachAssetMutate,
    mockUseAttachAsset: vi.fn(() => ({
      mutate: mockAttachAssetMutate,
      isPending: false,
    })),
    mockUseDetachAsset: vi.fn(() => ({
      mutate: mockDetachAssetMutate,
      isPending: false,
    })),
    mockUseAttachableAssets: vi.fn(() => ({
      data: [
        {
          id: "asset-1",
          hostname: "host-loose-1",
          ip: "10.0.0.1",
          role: "Workstation",
          deviceGroup: {
            vendor: { canonicalDisplayName: "Acme" },
            product: { canonicalDisplayName: "X100" },
          },
        },
        {
          id: "asset-2",
          hostname: null,
          ip: "10.0.0.2",
          role: null,
          deviceGroup: null,
        },
      ],
    })),
    mockUseMarkTicketSeen: vi.fn(() => ({
      mutate: mockMarkSeenMutate,
      isPending: false,
    })),
    mockUseAttachChild: vi.fn(() => ({
      mutate: mockAttachMutate,
      isPending: false,
    })),
    mockUseDetachChild: vi.fn(() => ({
      mutate: mockDetachMutate,
      isPending: false,
    })),
    mockUseAttachableChildren: vi.fn(() => ({
      data: [
        {
          id: "loose-1",
          summary: "Standalone ticket A",
          status: "TO_DO",
          parent: null,
        },
        {
          id: "loose-2",
          summary: "Already a child",
          status: "DONE",
          parent: { id: "other-parent", summary: "Other parent ticket" },
        },
      ],
    })),
    mockUseUpdateTicket: vi.fn(() => ({
      mutate: mockMutate,
      isPending: false,
    })),
    mockUseAssignableUsers: vi.fn(() => ({
      data: [
        { id: "u1", name: "Alice", email: "alice@example.com", image: null },
        { id: "u2", name: "Bob", email: "bob@example.com", image: null },
      ],
    })),
    mockUseDepartments: vi.fn(() => ({
      data: [
        { id: "d-radio", name: "Radiology", color: "blue" },
        { id: "d-biomed", name: "Biomed", color: "green" },
        { id: "d-it", name: "IT", color: "purple" },
      ],
    })),
    mockUseAddTicketComment: vi.fn(() => ({
      mutate: mockAddCommentMutate,
      isPending: false,
    })),
    mockUseSuspenseTrackingTicket: vi.fn(),
    mockUseSession: vi.fn(() => ({
      data: {
        user: { id: "u1", name: "Alice", email: "alice@example.com" },
      },
    })),
  };
});

vi.mock("../hooks/use-tracking", () => ({
  useUpdateTicket: mockUseUpdateTicket,
  useAssignableUsers: mockUseAssignableUsers,
  useDepartments: mockUseDepartments,
  useAddTicketComment: mockUseAddTicketComment,
  useSuspenseTrackingTicket: mockUseSuspenseTrackingTicket,
  useMarkTicketSeen: mockUseMarkTicketSeen,
  useAttachChild: mockUseAttachChild,
  useDetachChild: mockUseDetachChild,
  useAttachableChildren: mockUseAttachableChildren,
  useAttachAsset: mockUseAttachAsset,
  useDetachAsset: mockUseDetachAsset,
  useAttachableAssets: mockUseAttachableAssets,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: mockUseSession },
}));

import {
  AddCommentForm,
  DepartmentMultiSelect,
  LinkedAssetsTable,
  TicketDetailContent,
  TicketEditForm,
} from "./ticket-detail";

beforeEach(() => {
  vi.clearAllMocks();
});

const departmentOptions = [
  { id: "d-radio", name: "Radiology", color: "blue" },
  { id: "d-biomed", name: "Biomed", color: "green" },
  { id: "d-it", name: "IT", color: "purple" },
];

describe("DepartmentMultiSelect", () => {
  it("renders a chip for each selected department", () => {
    render(
      <DepartmentMultiSelect
        options={departmentOptions}
        selectedIds={["d-radio", "d-biomed"]}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Radiology")).toBeInTheDocument();
    expect(screen.getByText("Biomed")).toBeInTheDocument();
    expect(screen.queryByText("IT")).not.toBeInTheDocument();
  });

  it("shows placeholder count when nothing is selected", () => {
    render(
      <DepartmentMultiSelect
        options={departmentOptions}
        selectedIds={[]}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText(/select departments/i)).toBeInTheDocument();
  });

  it("removes a department when its chip X is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DepartmentMultiSelect
        options={departmentOptions}
        selectedIds={["d-radio", "d-biomed"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /remove radiology/i }));

    expect(onChange).toHaveBeenCalledWith(["d-biomed"]);
  });

  it("adds a department when an unselected option is picked from the popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DepartmentMultiSelect
        options={departmentOptions}
        selectedIds={["d-radio"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /biomed/i }));

    expect(onChange).toHaveBeenCalledWith(["d-radio", "d-biomed"]);
  });

  it("removes a department when its already-selected option is picked again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DepartmentMultiSelect
        options={departmentOptions}
        selectedIds={["d-radio", "d-biomed"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /radiology/i }));

    expect(onChange).toHaveBeenCalledWith(["d-biomed"]);
  });
});

// Minimal TicketDetail shape used by TicketEditForm
const makeTicket = (
  overrides: Partial<Parameters<typeof TicketEditForm>[0]["data"]> = {},
) =>
  ({
    id: "ticket-1",
    summary: "Initial summary",
    status: "TO_DO",
    category: "PATCH",
    departments: [{ id: "d-radio", name: "Radiology", color: "blue" }],
    descriptions: [
      {
        id: "desc-1",
        ticketId: "ticket-1",
        departmentId: "d-radio",
        body: "Initial Radiology description",
        createdAt: new Date("2026-05-01T00:00:00Z"),
        updatedAt: new Date("2026-05-01T00:00:00Z"),
        department: { id: "d-radio", name: "Radiology", color: "blue" },
      },
    ],
    assignee: { id: "u1", name: "Alice", email: "alice@example.com" },
    scheduledAt: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
    parent: null,
    children: [],
    assets: [],
    vulnerabilities: [],
    issues: [],
    remediations: [],
    advisories: [],
    comments: [],
    creator: { id: "u1", name: "Alice", email: "alice@example.com" },
    source: "MANUAL",
    sourceWorkflow: null,
    sourceWorkflowId: null,
    parentId: null,
    creatorId: "u1",
    assigneeId: "u1",
    seenBy: [],
    activities: [],
    ...overrides,
    // biome-ignore lint/suspicious/noExplicitAny: test stub for TicketDetail shape
  }) as any;

describe("TicketEditForm", () => {
  it("prefills inputs from the ticket", () => {
    render(<TicketEditForm data={makeTicket()} onCancel={() => {}} />);

    expect((screen.getByLabelText(/summary/i) as HTMLInputElement).value).toBe(
      "Initial summary",
    );
    // Per-department description tab is labelled by its sr-only Label.
    expect(
      (screen.getByLabelText(/radiology description/i) as HTMLTextAreaElement)
        .value,
    ).toBe("Initial Radiology description");
    // The selected department appears as a chip inside the multi-select group
    expect(screen.getAllByText("Radiology").length).toBeGreaterThan(0);
  });

  it("calls onCancel directly when the form is clean", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<TicketEditForm data={makeTicket()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("prompts and discards when Cancel is clicked with unsaved changes", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    render(<TicketEditForm data={makeTicket()} onCancel={onCancel} />);

    // Make the form dirty
    const summary = screen.getByLabelText(/summary/i);
    await user.clear(summary);
    await user.type(summary, "Edited");

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("stays in the editor when the user declines the discard prompt", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    render(<TicketEditForm data={makeTicket()} onCancel={onCancel} />);

    const summary = screen.getByLabelText(/summary/i);
    await user.clear(summary);
    await user.type(summary, "Edited");

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("registers a beforeunload guard once the form is dirty and clears it when the form is reverted", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    render(<TicketEditForm data={makeTicket()} onCancel={() => {}} />);

    // Clean form: no beforeunload listener should be registered
    expect(
      addSpy.mock.calls.find(([type]) => type === "beforeunload"),
    ).toBeUndefined();

    // Make the form dirty -> guard registers
    const summary = screen.getByLabelText(/summary/i);
    await user.type(summary, "x");
    expect(addSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(
      true,
    );

    // Revert to the original value -> guard is torn down
    await user.clear(summary);
    await user.type(summary, "Initial summary");
    expect(removeSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(
      true,
    );

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("submits the full edited payload, including multi-dept set and per-dept descriptions", async () => {
    const user = userEvent.setup();
    render(<TicketEditForm data={makeTicket()} onCancel={() => {}} />);

    // Change summary
    const summary = screen.getByLabelText(/summary/i);
    await user.clear(summary);
    await user.type(summary, "Updated summary");

    // Add a second department by clicking the multi-select trigger
    await user.click(screen.getByText(/1 selected/i));
    await user.click(await screen.findByRole("option", { name: /biomed/i }));

    // Submit
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockMutate.mock.calls[0];
    expect(payload).toMatchObject({
      id: "ticket-1",
      summary: "Updated summary",
      status: "TO_DO",
      category: "PATCH",
      departmentIds: ["d-radio", "d-biomed"],
      assigneeId: "u1",
      scheduledAt: null,
    });
    // Only departments with non-empty bodies are sent. The newly-added Biomed
    // tab has no body yet, so it should not appear in `descriptions`.
    expect(payload.descriptions).toEqual([
      { departmentId: "d-radio", body: "Initial Radiology description" },
    ]);
  });

  it("drops a department's description from the payload when its textarea is cleared", async () => {
    const user = userEvent.setup();
    render(<TicketEditForm data={makeTicket()} onCancel={() => {}} />);

    const desc = screen.getByLabelText(/radiology description/i);
    await user.clear(desc);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const [payload] = mockMutate.mock.calls[0];
    expect(payload.descriptions).toEqual([]);
  });

  it("sends a new description for a freshly-added department once typed", async () => {
    const user = userEvent.setup();
    render(<TicketEditForm data={makeTicket()} onCancel={() => {}} />);

    // Add Biomed to the ticket
    await user.click(screen.getByText(/1 selected/i));
    await user.click(await screen.findByRole("option", { name: /biomed/i }));

    // Switch to the Biomed tab and write something. The tab trigger contains
    // a Badge with text "Biomed" — pick the tab role rather than the option
    // we just clicked.
    await user.click(screen.getByRole("tab", { name: /biomed/i }));
    const biomedDesc = screen.getByLabelText(/biomed description/i);
    await user.type(biomedDesc, "Biomed write-up");

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const [payload] = mockMutate.mock.calls[0];
    expect(payload.descriptions).toEqual(
      expect.arrayContaining([
        { departmentId: "d-radio", body: "Initial Radiology description" },
        { departmentId: "d-biomed", body: "Biomed write-up" },
      ]),
    );
  });

  it("sends empty departmentIds when all chips are removed", async () => {
    const user = userEvent.setup();
    render(<TicketEditForm data={makeTicket()} onCancel={() => {}} />);

    // The form's selected-chip region is rendered by the multi-select; remove Radiology
    await user.click(screen.getByRole("button", { name: /remove radiology/i }));

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const [payload] = mockMutate.mock.calls[0];
    expect(payload.departmentIds).toEqual([]);
  });

  it("does not submit when summary is empty", async () => {
    const user = userEvent.setup();
    render(<TicketEditForm data={makeTicket()} onCancel={() => {}} />);

    const summary = screen.getByLabelText(/summary/i);
    await user.clear(summary);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("disables Save and shows Saving... while mutation is pending", () => {
    mockUseUpdateTicket.mockReturnValueOnce({
      mutate: mockMutate,
      isPending: true,
    });

    render(<TicketEditForm data={makeTicket()} onCancel={() => {}} />);

    const save = screen.getByRole("button", { name: /saving/i });
    expect(save).toBeDisabled();
  });

  it("changes assignee through the Select", async () => {
    const user = userEvent.setup();
    render(<TicketEditForm data={makeTicket()} onCancel={() => {}} />);

    // Open the assignee Select (Radix combobox role on trigger)
    const triggers = screen.getAllByRole("combobox");
    // First combobox in the form is the assignee Select (DepartmentMultiSelect comes later)
    await user.click(triggers[0]);
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByText("Bob"));

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const [payload] = mockMutate.mock.calls[0];
    expect(payload.assigneeId).toBe("u2");
  });
});

describe("AddCommentForm", () => {
  it("disables the Comment button when the body is empty", () => {
    render(<AddCommentForm ticketId="t1" />);
    expect(screen.getByRole("button", { name: /comment/i })).toBeDisabled();
  });

  it("enables submit once text is entered, then calls mutate with trimmed body", async () => {
    const user = userEvent.setup();
    render(<AddCommentForm ticketId="t1" />);

    const textarea = screen.getByPlaceholderText(/write a comment/i);
    await user.type(textarea, "   Looks good   ");

    const submit = screen.getByRole("button", { name: /comment/i });
    expect(submit).toBeEnabled();

    await user.click(submit);

    expect(mockAddCommentMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockAddCommentMutate.mock.calls[0];
    expect(payload).toMatchObject({ ticketId: "t1", body: "Looks good" });
  });

  it("submits with Cmd/Ctrl+Enter shortcut", async () => {
    const user = userEvent.setup();
    render(<AddCommentForm ticketId="t1" />);

    const textarea = screen.getByPlaceholderText(/write a comment/i);
    await user.type(textarea, "Quick one");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(mockAddCommentMutate).toHaveBeenCalledTimes(1);
  });

  it("shows Posting... and disables submit while pending", () => {
    mockUseAddTicketComment.mockReturnValueOnce({
      mutate: mockAddCommentMutate,
      isPending: true,
    });
    render(<AddCommentForm ticketId="t1" />);

    expect(screen.getByRole("button", { name: /posting/i })).toBeDisabled();
  });

  it("registers a beforeunload guard once the textarea has content and clears it when emptied", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    render(<AddCommentForm ticketId="t1" />);

    expect(
      addSpy.mock.calls.find(([type]) => type === "beforeunload"),
    ).toBeUndefined();

    const textarea = screen.getByPlaceholderText(/write a comment/i);
    await user.type(textarea, "draft");
    expect(addSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(
      true,
    );

    await user.clear(textarea);
    expect(removeSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(
      true,
    );

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

const sampleAsset = (overrides: Record<string, unknown> = {}) => ({
  id: "asset-1",
  hostname: "host-1",
  ip: "10.0.0.5",
  role: "Infusion Pump",
  macAddress: "00:11:22:33:44:55",
  location: { building: "A", floor: "3", room: "302" },
  deviceGroupId: "dg-1",
  deviceGroup: {
    id: "dg-1",
    vendorId: "vendor-icu",
    productId: "product-plum",
    versionId: null,
    vendor: { canonicalDisplayName: "ICU Medical" },
    product: { canonicalDisplayName: "Plum 360" },
    version: null,
  },
  ...overrides,
});

describe("LinkedAssetsTable", () => {
  it("renders one row per asset with role, model, IP, MAC, and location", () => {
    render(
      <LinkedAssetsTable assets={[sampleAsset()] as never} remediations={[]} />,
    );

    expect(screen.getByText("Infusion Pump")).toBeInTheDocument();
    expect(screen.getByText("ICU Medical Plum 360")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.5")).toBeInTheDocument();
    expect(screen.getByText("00:11:22:33:44:55")).toBeInTheDocument();
    expect(screen.getByText("A · 3 · 302")).toBeInTheDocument();
  });

  it("links the role cell to the asset detail page", () => {
    render(
      <LinkedAssetsTable assets={[sampleAsset()] as never} remediations={[]} />,
    );

    const link = screen.getByRole("link", { name: /infusion pump/i });
    expect(link).toHaveAttribute("href", "/assets/asset-1");
  });

  it("falls back to em-dashes for missing role, MAC, and location fields", () => {
    render(
      <LinkedAssetsTable
        assets={
          [
            sampleAsset({
              role: null,
              macAddress: null,
              location: null,
              deviceGroup: null,
            }),
          ] as never
        }
        remediations={[]}
      />,
    );

    // The role cell contains a "—" link, MAC cell contains "—", location cell contains "—"
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("matches a remediation to the asset via device-group matching rules", () => {
    render(
      <LinkedAssetsTable
        assets={[sampleAsset()] as never}
        remediations={
          [
            {
              id: "rem-1",
              description: "Apply firmware patch v2.3",
              deviceGroupMatchings: [
                {
                  vendorId: "vendor-icu",
                  productId: "product-plum",
                  versionId: null,
                  versionRange: null,
                },
              ],
            },
          ] as never
        }
      />,
    );

    expect(screen.getByText(/firmware patch v2\.3/i)).toBeInTheDocument();
  });

  it("shows em-dash when no remediation targets the asset's device group", () => {
    render(
      <LinkedAssetsTable
        assets={[sampleAsset()] as never}
        remediations={
          [
            {
              id: "rem-1",
              description: "Different group only",
              deviceGroupMatchings: [
                {
                  vendorId: "vendor-other",
                  productId: null,
                  versionId: null,
                  versionRange: null,
                },
              ],
            },
          ] as never
        }
      />,
    );

    // role/MAC/location are populated; the remediation cell should be the lone "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(1);
  });
});

const baseTicketDetail = (overrides: Record<string, unknown> = {}) => ({
  id: "ticket-1",
  summary: "Patch ICU monitors",
  status: "IN_PROGRESS",
  category: "PATCH",
  lifeSafety: false,
  departments: [
    { id: "d-radio", name: "Radiology", color: "blue" },
    { id: "d-it", name: "IT", color: "purple" },
  ],
  descriptions: [
    {
      id: "desc-radio",
      ticketId: "ticket-1",
      departmentId: "d-radio",
      body: "Roll out firmware update v3.2 to all ICU units.",
      createdAt: new Date("2026-05-01T00:00:00Z"),
      updatedAt: new Date("2026-05-01T00:00:00Z"),
      department: { id: "d-radio", name: "Radiology", color: "blue" },
    },
    {
      id: "desc-it",
      ticketId: "ticket-1",
      departmentId: "d-it",
      body: "Coordinate network maintenance window with NOC.",
      createdAt: new Date("2026-05-01T00:00:00Z"),
      updatedAt: new Date("2026-05-01T00:00:00Z"),
      department: { id: "d-it", name: "IT", color: "purple" },
    },
  ],
  assignee: { id: "u2", name: "Bob", email: "bob@example.com" },
  scheduledAt: new Date("2026-06-15T14:30:00Z"),
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
  parent: null,
  children: [],
  assets: [],
  vulnerabilities: [],
  issues: [],
  remediations: [],
  advisories: [],
  comments: [],
  creator: { id: "u1", name: "Alice", email: "alice@example.com" },
  source: "MANUAL",
  sourceWorkflow: null,
  sourceWorkflowId: null,
  parentId: null,
  creatorId: "u1",
  assigneeId: "u2",
  seenBy: [],
  activities: [],
  ...overrides,
});

const renderDetail = (overrides: Record<string, unknown> = {}) => {
  mockUseSuspenseTrackingTicket.mockReturnValue({
    data: baseTicketDetail(overrides),
  });
  return render(<TicketDetailContent id="ticket-1" />);
};

describe("TicketDetailContent — view mode", () => {
  it("renders the summary headline and the active department's description body", () => {
    renderDetail();
    expect(
      screen.getByRole("heading", { name: /patch icu monitors/i }),
    ).toBeInTheDocument();
    // The first tab is active by default and shows the Radiology description.
    expect(
      screen.getByText(/roll out firmware update v3\.2/i),
    ).toBeInTheDocument();
  });

  it("switches description body when another department tab is clicked", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("tab", { name: /^it$/i }));

    expect(
      screen.getByText(/coordinate network maintenance window/i),
    ).toBeInTheDocument();
  });

  it("renders nothing in the descriptions area when there are no descriptions", () => {
    renderDetail({ descriptions: [] });
    expect(
      screen.queryByText(/roll out firmware update/i),
    ).not.toBeInTheDocument();
  });

  it("renders the assignee, status, and category in the metadata grid", () => {
    renderDetail();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Patch")).toBeInTheDocument();
  });

  it("renders a badge for every linked department", () => {
    renderDetail();
    // The department names appear in both the metadata grid and the
    // description-tab strip, so multiple matches are expected.
    expect(screen.getAllByText("Radiology").length).toBeGreaterThan(0);
    expect(screen.getAllByText("IT").length).toBeGreaterThan(0);
  });

  it("renders a parent breadcrumb link when the ticket has a parent", () => {
    renderDetail({
      parent: { id: "parent-9", summary: "Quarterly patch sweep" },
    });
    const link = screen.getByRole("link", { name: /quarterly patch sweep/i });
    expect(link).toHaveAttribute("href", "/tracking/parent-9");
  });

  it("renders the sub-tickets section with each child's summary and status", () => {
    renderDetail({
      children: [
        {
          id: "child-1",
          summary: "Patch ICU room 301",
          status: "TO_DO",
          departments: [],
          _count: { comments: 2 },
        },
        {
          id: "child-2",
          summary: "Patch ICU room 302",
          status: "DONE",
          departments: [],
          _count: { comments: 0 },
        },
      ],
    });

    expect(screen.getByText("Patch ICU room 301")).toBeInTheDocument();
    expect(screen.getByText("Patch ICU room 302")).toBeInTheDocument();
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders advisories with links to each advisory page", () => {
    renderDetail({
      advisories: [
        {
          id: "adv-1",
          title: "Apache Log4j CVE-2021-44228",
          severity: "Critical",
        },
      ],
    });
    const link = screen.getByRole("link", { name: /apache log4j/i });
    expect(link).toHaveAttribute("href", "/advisories/adv-1");
  });

  it("shows 'No assets linked' when there are no linked assets", () => {
    renderDetail();
    expect(
      screen.getByText(/no assets linked to this ticket/i),
    ).toBeInTheDocument();
  });

  it("renders the Linked Assets table when assets are present", () => {
    renderDetail({
      assets: [sampleAsset()],
    });
    expect(screen.getByText("Infusion Pump")).toBeInTheDocument();
  });

  it("renders the author's department badge next to their name in comments", () => {
    renderDetail({
      comments: [
        {
          id: "c1",
          body: "Patched in the ICU bay tonight.",
          createdAt: new Date("2026-05-15T12:00:00Z"),
          author: {
            id: "u1",
            name: "Alice",
            email: "alice@example.com",
            image: null,
            department: { id: "d-biomed", name: "Biomed", color: "green" },
          },
        },
      ],
    });

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Biomed")).toBeInTheDocument();
  });

  it("renders activity entries interleaved with comments in chronological order", () => {
    renderDetail({
      comments: [
        {
          id: "c1",
          body: "All clear",
          createdAt: new Date("2026-05-15T13:00:00Z"),
          author: {
            id: "u1",
            name: "Alice",
            email: "alice@example.com",
            image: null,
            department: null,
          },
        },
      ],
      activities: [
        {
          id: "a1",
          ticketId: "ticket-1",
          userId: "u1",
          type: "STATUS_CHANGED",
          data: { from: "TO_DO", to: "IN_PROGRESS" },
          createdAt: new Date("2026-05-15T12:00:00Z"),
          user: { id: "u1", name: "Alice", image: null },
        },
        {
          id: "a2",
          ticketId: "ticket-1",
          userId: "u2",
          type: "ASSET_ATTACHED",
          data: { assetId: "asset-x", assetLabel: "host-icu-1" },
          createdAt: new Date("2026-05-15T14:00:00Z"),
          user: { id: "u2", name: "Bob", image: null },
        },
      ],
    });

    // Activities and comments both rendered
    expect(
      screen.getByLabelText("Activity: STATUS_CHANGED"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Activity: ASSET_ATTACHED"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Comment")).toBeInTheDocument();

    // The status-change tagline is human-readable
    expect(screen.getByText(/changed status from/i)).toBeInTheDocument();

    // Asset label surfaces in the tagline
    expect(screen.getByText("host-icu-1")).toBeInTheDocument();

    // Chronological order: status change (12:00) before comment (13:00)
    // before asset attach (14:00). Check by position in the timeline.
    const items = screen.getAllByRole("listitem");
    const orderedLabels = items.map(
      (li) => li.getAttribute("aria-label") ?? "",
    );
    const statusIdx = orderedLabels.indexOf("Activity: STATUS_CHANGED");
    const commentIdx = orderedLabels.indexOf("Comment");
    const assetIdx = orderedLabels.indexOf("Activity: ASSET_ATTACHED");
    expect(statusIdx).toBeGreaterThanOrEqual(0);
    expect(commentIdx).toBeGreaterThan(statusIdx);
    expect(assetIdx).toBeGreaterThan(commentIdx);
  });

  it("shows 'No activity yet' when there are no comments or activities", () => {
    renderDetail();
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
});

describe("TicketDetailContent — edit mode", () => {
  it("clicking Edit hides the metadata view and shows the form", async () => {
    const user = userEvent.setup();
    renderDetail();

    // View mode: Summary heading visible, no Summary label input
    expect(screen.queryByLabelText(/^summary$/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(screen.getByLabelText(/^summary$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    // The Edit button itself should disappear while editing
    expect(
      screen.queryByRole("button", { name: /^edit$/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking Cancel returns to the view", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByLabelText(/^summary$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
  });
});

describe("TicketDetailContent — markSeen on mount", () => {
  it("fires the markSeen mutation once with the current ticket id", () => {
    renderDetail();
    expect(mockMarkSeenMutate).toHaveBeenCalledTimes(1);
    expect(mockMarkSeenMutate).toHaveBeenCalledWith({ ticketId: "ticket-1" });
  });
});

describe("TicketDetailContent — sub-tickets attach/detach", () => {
  it("shows the 'Add sub-ticket' button and an empty state when there are no children", () => {
    renderDetail();
    expect(
      screen.getByRole("button", { name: /add sub-ticket/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no sub-tickets yet/i)).toBeInTheDocument();
  });

  it("calls attachChild with parentId + selected childId when picker option is clicked", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: /add sub-ticket/i }));
    await user.click(
      await screen.findByRole("option", { name: /standalone ticket a/i }),
    );

    expect(mockAttachMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockAttachMutate.mock.calls[0];
    expect(payload).toMatchObject({
      parentId: "ticket-1",
      childId: "loose-1",
    });
  });

  it("shows a warning icon for picker candidates that already have a parent", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: /add sub-ticket/i }));

    // Loose ticket has no parent → no warning icon
    expect(
      screen.queryByLabelText(/currently a child of/i),
    ).toBeInTheDocument();
    // Specifically for the one with a parent, the tooltip names the parent
    expect(
      screen.getByLabelText(/currently a child of other parent ticket/i),
    ).toBeInTheDocument();
  });

  it("shows a Detach button per child and calls detachChild on click", async () => {
    const user = userEvent.setup();
    renderDetail({
      children: [
        {
          id: "child-1",
          summary: "Patch ICU room 301",
          status: "TO_DO",
          departments: [],
          _count: { comments: 0 },
        },
      ],
    });

    const detachBtn = screen.getByRole("button", {
      name: /detach patch icu room 301/i,
    });
    await user.click(detachBtn);

    expect(mockDetachMutate).toHaveBeenCalledTimes(1);
    expect(mockDetachMutate).toHaveBeenCalledWith({ ticketId: "child-1" });
  });
});

describe("TicketDetailContent — assets attach/detach", () => {
  it("renders an 'Add asset' button in the Linked Assets tab", () => {
    renderDetail();
    expect(
      screen.getByRole("button", { name: /add asset/i }),
    ).toBeInTheDocument();
  });

  it("calls attachAsset with ticketId + selected assetId from the picker", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: /add asset/i }));
    await user.click(
      await screen.findByRole("option", { name: /host-loose-1/i }),
    );

    expect(mockAttachAssetMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockAttachAssetMutate.mock.calls[0];
    expect(payload).toMatchObject({ ticketId: "ticket-1", assetId: "asset-1" });
  });

  it("renders a per-row detach button on linked assets and calls detachAsset on click", async () => {
    const user = userEvent.setup();
    renderDetail({
      assets: [sampleAsset({ id: "linked-asset", hostname: "linked-host" })],
    });

    const detachBtn = screen.getByRole("button", {
      name: /detach linked-host/i,
    });
    await user.click(detachBtn);

    expect(mockDetachAssetMutate).toHaveBeenCalledTimes(1);
    expect(mockDetachAssetMutate).toHaveBeenCalledWith({
      ticketId: "ticket-1",
      assetId: "linked-asset",
    });
  });
});
