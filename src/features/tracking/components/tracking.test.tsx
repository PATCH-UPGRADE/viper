import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
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
  mockUseTrackingParams,
  mockSetParams,
  mockUseSuspenseTrackingTickets,
  mockUseEntitySearch,
  mockOnSearchChange,
  mockRouterPush,
  mockUseRouter,
  mockSetWatchingMutate,
  mockUseSetWatching,
} = vi.hoisted(() => {
  const mockSetParams = vi.fn();
  const mockOnSearchChange = vi.fn();
  const mockRouterPush = vi.fn();
  const mockSetWatchingMutate = vi.fn();
  return {
    mockSetParams,
    mockOnSearchChange,
    mockRouterPush,
    mockSetWatchingMutate,
    mockUseSetWatching: vi.fn(() => ({
      mutate: mockSetWatchingMutate,
      isPending: false,
    })),
    mockUseTrackingParams: vi.fn(() => [
      {
        tab: "suggested",
        search: "",
        page: 1,
        pageSize: 5,
        sort: "",
        lastUpdatedStartTime: "",
        lastUpdatedEndTime: "",
      },
      mockSetParams,
    ]),
    mockUseSuspenseTrackingTickets: vi.fn(() => ({
      // biome-ignore lint/suspicious/noExplicitAny: test stub - DataTable doesn't validate
      data: {
        items: [] as any[],
        page: 1,
        pageSize: 5,
        totalCount: 0,
        totalPages: 0,
      },
      isFetching: false,
    })),
    mockUseEntitySearch: vi.fn(() => ({
      searchValue: "",
      onSearchChange: mockOnSearchChange,
    })),
    mockUseRouter: vi.fn(() => ({
      push: mockRouterPush,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    })),
  };
});

vi.mock("../hooks/use-tracking-params", () => ({
  useTrackingParams: mockUseTrackingParams,
}));

vi.mock("../hooks/use-tracking", () => ({
  useSuspenseTrackingTickets: mockUseSuspenseTrackingTickets,
  useSetWatching: mockUseSetWatching,
}));

vi.mock("@/hooks/use-entity-search", () => ({
  useEntitySearch: mockUseEntitySearch,
}));

vi.mock("next/navigation", () => ({
  useRouter: mockUseRouter,
}));

// CategoryColorProvider uses a suspense query — replace with a passthrough.
vi.mock("@/features/tag-colors/context", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/tag-colors/context")
  >("@/features/tag-colors/context");
  return {
    ...actual,
    CategoryColorProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

import {
  TrackingContainer,
  TrackingError,
  TrackingHeader,
  TrackingList,
  TrackingLoading,
  TrackingSearch,
  TrackingTabsNav,
} from "./tracking";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TrackingHeader", () => {
  it("renders the title and description", () => {
    render(<TrackingHeader />);
    expect(
      screen.getByRole("heading", { name: /tracking/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/work order tickets and approval gates/i),
    ).toBeInTheDocument();
  });
});

describe("TrackingLoading / TrackingError", () => {
  it("TrackingLoading renders a loading message", () => {
    render(<TrackingLoading />);
    expect(screen.getByText(/loading tickets/i)).toBeInTheDocument();
  });

  it("TrackingError renders an error message", () => {
    render(<TrackingError />);
    expect(screen.getByText(/error loading tickets/i)).toBeInTheDocument();
  });
});

describe("TrackingContainer", () => {
  it("wraps children with the tracking header", () => {
    render(
      <TrackingContainer>
        <div data-testid="child">payload</div>
      </TrackingContainer>,
    );
    expect(
      screen.getByRole("heading", { name: /tracking/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("child")).toHaveTextContent("payload");
  });
});

describe("TrackingTabsNav", () => {
  it("renders all four tabs", () => {
    render(<TrackingTabsNav />);
    expect(screen.getByRole("tab", { name: /suggested/i })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /my department/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /requires approval/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^all$/i })).toBeInTheDocument();
  });

  it("marks the active tab from URL state", () => {
    mockUseTrackingParams.mockReturnValueOnce([
      {
        tab: "requires-approval",
        search: "",
        page: 1,
        pageSize: 5,
        sort: "",
        lastUpdatedStartTime: "",
        lastUpdatedEndTime: "",
      },
      mockSetParams,
    ]);

    render(<TrackingTabsNav />);
    const tab = screen.getByRole("tab", { name: /requires approval/i });
    expect(tab).toHaveAttribute("data-state", "active");
  });

  it("calls setParams with the picked tab and resets page to 1", async () => {
    const user = userEvent.setup();
    render(<TrackingTabsNav />);

    await user.click(screen.getByRole("tab", { name: /my department/i }));

    expect(mockSetParams).toHaveBeenCalledWith({
      tab: "my-department",
      page: 1,
    });
  });
});

describe("TrackingSearch", () => {
  it("renders an input with the placeholder", () => {
    render(<TrackingSearch />);
    expect(screen.getByPlaceholderText(/search tickets/i)).toBeInTheDocument();
  });

  it("calls onSearchChange when the user types", async () => {
    const user = userEvent.setup();
    render(<TrackingSearch />);

    await user.type(screen.getByPlaceholderText(/search tickets/i), "icu");

    // 3 keystrokes -> 3 onChange calls
    expect(mockOnSearchChange).toHaveBeenCalledTimes(3);
    expect(mockOnSearchChange).toHaveBeenLastCalledWith("u");
  });

  it("reflects the searchValue from useEntitySearch into the input", () => {
    mockUseEntitySearch.mockReturnValueOnce({
      searchValue: "imaging",
      onSearchChange: mockOnSearchChange,
    });

    render(<TrackingSearch />);
    expect(
      (screen.getByPlaceholderText(/search tickets/i) as HTMLInputElement)
        .value,
    ).toBe("imaging");
  });
});

const sampleTicket = (overrides: Record<string, unknown> = {}) => ({
  id: "ticket-1",
  summary: "Patch ICU monitors",
  status: "TO_DO",
  category: "PATCH",
  sourceLabel: null,
  sources: [],
  scheduledAt: new Date("2026-06-10T15:00:00Z"),
  departments: [{ id: "d-it", name: "IT", color: "purple" }],
  assignee: { id: "u1", name: "Alice", email: "alice@example.com" },
  creator: { id: "u1", name: "Alice", image: null },
  vulnerabilities: [],
  assets: [],
  children: [],
  linkedCount: 0,
  commentCount: 3,
  linkedPreview: [],
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
  _count: {
    comments: 3,
    issues: 0,
    vulnerabilities: 0,
    remediations: 0,
    advisories: 0,
    assets: 0,
  },
  isWatching: false,
  hasUnreadComments: false,
  ...overrides,
});

const renderTrackingList = () =>
  render(<TrackingList />, { wrapper: withNuqsTestingAdapter() });

describe("TrackingList", () => {
  it("renders the empty state when no tickets are returned", () => {
    renderTrackingList();
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  it("renders ticket rows from the paginated response", () => {
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [
          sampleTicket(),
          sampleTicket({ id: "ticket-2", summary: "Update PACS server" }),
        ],
        page: 1,
        pageSize: 5,
        totalCount: 2,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();
    expect(screen.getByText(/patch icu monitors/i)).toBeInTheDocument();
    expect(screen.getByText(/update pacs server/i)).toBeInTheDocument();
  });

  it("navigates to the ticket detail page when a leaf parent (no children) is clicked", async () => {
    const user = userEvent.setup();
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [sampleTicket()],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();

    const row = screen.getByText(/patch icu monitors/i).closest("tr");
    if (!row) throw new Error("row not found");
    await user.click(row);

    expect(mockRouterPush).toHaveBeenCalledWith("/tracking/ticket-1");
  });

  it("expands a parent with sub-tickets on first click and navigates on the second", async () => {
    const user = userEvent.setup();
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [
          sampleTicket({
            id: "parent-1",
            summary: "Parent ticket",
            children: [
              sampleTicket({ id: "child-1", summary: "Child ticket" }),
            ],
          }),
        ],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();

    // Child is hidden initially
    expect(screen.queryByText("Child ticket")).not.toBeInTheDocument();

    const parentRow = screen.getByText("Parent ticket").closest("tr");
    if (!parentRow) throw new Error("parent row not found");

    // First click → expand, no navigation
    await user.click(parentRow);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.getByText("Child ticket")).toBeInTheDocument();

    // Second click on the (now-expanded) parent → navigate
    await user.click(parentRow);
    expect(mockRouterPush).toHaveBeenCalledWith("/tracking/parent-1");
  });

  it("renders a 'not watching' indicator by default", () => {
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [sampleTicket({ isWatching: false })],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();
    expect(
      screen.getByLabelText(/not watching — click to watch/i),
    ).toBeInTheDocument();
  });

  it("renders a 'watching' indicator when the user watches the ticket", () => {
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [sampleTicket({ isWatching: true })],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();
    expect(
      screen.getByLabelText(/watching — click to unwatch/i),
    ).toBeInTheDocument();
  });

  it("toggles watch state when the indicator is clicked", async () => {
    const user = userEvent.setup();
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [sampleTicket({ id: "ticket-1", isWatching: false })],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();
    await user.click(screen.getByLabelText(/not watching — click to watch/i));

    expect(mockSetWatchingMutate).toHaveBeenCalledWith({
      ticketId: "ticket-1",
      watching: true,
    });
    // Clicking the indicator must not navigate to the ticket.
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("shows a plain Comments cell when there are no unread comments", () => {
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [sampleTicket({ hasUnreadComments: false })],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();
    expect(screen.getByLabelText("Comments")).toBeInTheDocument();
    expect(screen.queryByLabelText("Unread comments")).not.toBeInTheDocument();
  });

  it("highlights the Comments cell when there are unread comments", () => {
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [sampleTicket({ hasUnreadComments: true })],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();
    expect(screen.getByLabelText("Unread comments")).toBeInTheDocument();
    expect(screen.queryByLabelText("Comments")).not.toBeInTheDocument();
  });

  it("shows a tree-connector on every child row, with an elbow (└) on the last and a T-junction (├) on the others", async () => {
    const user = userEvent.setup();
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [
          sampleTicket({
            id: "parent-1",
            summary: "Parent ticket",
            children: [
              sampleTicket({ id: "child-1", summary: "First child" }),
              sampleTicket({ id: "child-2", summary: "Middle child" }),
              sampleTicket({ id: "child-3", summary: "Last child" }),
            ],
          }),
        ],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();

    // Collapsed: no child rows, no connectors yet
    expect(screen.queryAllByLabelText(/^(Last )?Child ticket$/i)).toHaveLength(
      0,
    );

    await user.click(screen.getByLabelText(/expand nested data/i));

    // Non-last children get the T-shape ("Child ticket")
    expect(screen.getAllByLabelText("Child ticket")).toHaveLength(2);
    // The last child gets the elbow ("Last child ticket")
    expect(screen.getAllByLabelText("Last child ticket")).toHaveLength(1);

    // And the rows themselves are visible
    expect(screen.getByText("First child")).toBeInTheDocument();
    expect(screen.getByText("Middle child")).toBeInTheDocument();
    expect(screen.getByText("Last child")).toBeInTheDocument();
  });

  it("renders an independent watch indicator per row (parent and children)", async () => {
    const user = userEvent.setup();
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [
          sampleTicket({
            id: "parent-1",
            summary: "Parent ticket",
            isWatching: true,
            children: [
              sampleTicket({
                id: "child-1",
                summary: "Child ticket",
                isWatching: false,
              }),
            ],
          }),
        ],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();

    // Parent (watching) is shown before expansion.
    expect(
      screen.getByLabelText(/watching — click to unwatch/i),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText(/expand nested data/i));

    // After expanding, the child's own (not-watching) indicator appears
    // independently of the parent's.
    expect(
      screen.getByLabelText(/watching — click to unwatch/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/not watching — click to watch/i),
    ).toBeInTheDocument();
  });

  it("renders the parent comments cell as 'X (Y)' when child comments add to the total", () => {
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [
          sampleTicket({
            commentCount: 5, // rolled total
            _count: {
              comments: 2, // own count
              issues: 0,
              vulnerabilities: 0,
              remediations: 0,
              advisories: 0,
              assets: 0,
            },
          }),
        ],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();
    const cell = screen.getByLabelText("Comments");
    expect(cell).toHaveTextContent("5 (2)");
  });

  it("omits the breakdown when own and total counts match", () => {
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [
          sampleTicket({
            commentCount: 3,
            _count: {
              comments: 3,
              issues: 0,
              vulnerabilities: 0,
              remediations: 0,
              advisories: 0,
              assets: 0,
            },
          }),
        ],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });

    renderTrackingList();
    const cell = screen.getByLabelText("Comments");
    expect(cell).toHaveTextContent("3");
    expect(cell.textContent).not.toContain("(");
  });
});

describe("TrackingList — source column", () => {
  const renderWith = (overrides: Record<string, unknown>) => {
    mockUseSuspenseTrackingTickets.mockReturnValueOnce({
      data: {
        items: [sampleTicket(overrides)],
        page: 1,
        pageSize: 5,
        totalCount: 1,
        totalPages: 1,
      },
      isFetching: false,
    });
    renderTrackingList();
  };

  it("shows the creator's name when there is no ingested source (manual)", () => {
    renderWith({
      sources: [],
      creator: { id: "u9", name: "Carol Creator", image: null },
    });
    expect(screen.getByText("Carol Creator")).toBeInTheDocument();
  });

  it("shows the email address for an Email source", () => {
    renderWith({
      sources: [{ channel: "Email" }],
      sourceLabel: "ops@stmary.example.org",
    });
    expect(screen.getByText("ops@stmary.example.org")).toBeInTheDocument();
  });

  it("shows the service name for a PolledApi (integration) source", () => {
    renderWith({
      sources: [{ channel: "PolledApi" }],
      sourceLabel: "Armis",
    });
    expect(screen.getByText("Armis")).toBeInTheDocument();
  });

  it("falls back to the channel name when sourceLabel is null", () => {
    renderWith({ sources: [{ channel: "Email" }], sourceLabel: null });
    expect(screen.getByText("Email")).toBeInTheDocument();
  });
});
