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
} = vi.hoisted(() => {
  const mockMutate = vi.fn();
  const mockAddCommentMutate = vi.fn();
  return {
    mockMutate,
    mockAddCommentMutate,
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
    description: "Initial description",
    status: "TO_DO",
    category: "PATCH",
    lifeSafety: false,
    departments: [{ id: "d-radio", name: "Radiology", color: "blue" }],
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
    ...overrides,
    // biome-ignore lint/suspicious/noExplicitAny: test stub for TicketDetail shape
  }) as any;

describe("TicketEditForm", () => {
  it("prefills inputs from the ticket", () => {
    render(<TicketEditForm data={makeTicket()} onCancel={() => {}} />);

    expect(
      (screen.getByLabelText(/summary/i) as HTMLInputElement).value,
    ).toBe("Initial summary");
    expect(
      (screen.getByLabelText(/description/i) as HTMLTextAreaElement).value,
    ).toBe("Initial description");
    // The selected department appears as a chip inside the multi-select group
    expect(screen.getAllByText("Radiology").length).toBeGreaterThan(0);
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<TicketEditForm data={makeTicket()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("submits the full edited payload, including multi-dept set", async () => {
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
      description: "Initial description",
      status: "TO_DO",
      category: "PATCH",
      lifeSafety: false,
      departmentIds: ["d-radio", "d-biomed"],
      assigneeId: "u1",
      scheduledAt: null,
    });
  });

  it("sends null description when the textarea is cleared", async () => {
    const user = userEvent.setup();
    render(<TicketEditForm data={makeTicket()} onCancel={() => {}} />);

    const desc = screen.getByLabelText(/description/i);
    await user.clear(desc);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const [payload] = mockMutate.mock.calls[0];
    expect(payload.description).toBeNull();
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
});

const sampleAsset = (overrides: Record<string, unknown> = {}) => ({
  id: "asset-1",
  hostname: "host-1",
  ip: "10.0.0.5",
  role: "Infusion Pump",
  macAddress: "00:11:22:33:44:55",
  location: { building: "A", floor: "3", room: "302" },
  deviceGroupId: "dg-1",
  deviceGroup: { id: "dg-1", modelName: "Plum 360", manufacturer: "ICU Medical" },
  ...overrides,
});

describe("LinkedAssetsTable", () => {
  it("renders one row per asset with role, model, IP, MAC, and location", () => {
    render(
      <LinkedAssetsTable
        assets={[sampleAsset()] as never}
        remediations={[]}
      />,
    );

    expect(screen.getByText("Infusion Pump")).toBeInTheDocument();
    expect(screen.getByText("ICU Medical Plum 360")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.5")).toBeInTheDocument();
    expect(screen.getByText("00:11:22:33:44:55")).toBeInTheDocument();
    expect(screen.getByText("A · 3 · 302")).toBeInTheDocument();
  });

  it("links the role cell to the asset detail page", () => {
    render(
      <LinkedAssetsTable
        assets={[sampleAsset()] as never}
        remediations={[]}
      />,
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

  it("matches a remediation to the asset via deviceGroupId", () => {
    render(
      <LinkedAssetsTable
        assets={[sampleAsset()] as never}
        remediations={
          [
            {
              id: "rem-1",
              description: "Apply firmware patch v2.3",
              affectedDeviceGroups: [{ id: "dg-1" }],
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
              affectedDeviceGroups: [{ id: "dg-other" }],
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
  description: "Roll out firmware update v3.2 to all ICU units.",
  status: "IN_PROGRESS",
  category: "PATCH",
  lifeSafety: false,
  departments: [
    { id: "d-radio", name: "Radiology", color: "blue" },
    { id: "d-it", name: "IT", color: "purple" },
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
  ...overrides,
});

const renderDetail = (overrides: Record<string, unknown> = {}) => {
  mockUseSuspenseTrackingTicket.mockReturnValue({
    data: baseTicketDetail(overrides),
  });
  return render(<TicketDetailContent id="ticket-1" />);
};

describe("TicketDetailContent — view mode", () => {
  it("renders the summary headline and description body", () => {
    renderDetail();
    expect(
      screen.getByRole("heading", { name: /patch icu monitors/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/roll out firmware update v3\.2/i),
    ).toBeInTheDocument();
  });

  it("renders the assignee, status, and category in the metadata grid", () => {
    renderDetail();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Patch")).toBeInTheDocument();
  });

  it("renders a badge for every linked department", () => {
    renderDetail();
    expect(screen.getByText("Radiology")).toBeInTheDocument();
    expect(screen.getByText("IT")).toBeInTheDocument();
  });

  it("does NOT show the life-safety icon by default", () => {
    renderDetail();
    expect(
      screen.queryByLabelText(/life safety/i),
    ).not.toBeInTheDocument();
  });

  it("shows the life-safety icon when lifeSafety=true", () => {
    renderDetail({ lifeSafety: true });
    expect(screen.getByLabelText(/life safety/i)).toBeInTheDocument();
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
        { id: "adv-1", title: "Apache Log4j CVE-2021-44228", severity: "Critical" },
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
