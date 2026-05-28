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
} = vi.hoisted(() => {
  const mockSetParams = vi.fn();
  const mockOnSearchChange = vi.fn();
  const mockRouterPush = vi.fn();
  return {
    mockSetParams,
    mockOnSearchChange,
    mockRouterPush,
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
    expect(
      screen.getByPlaceholderText(/search tickets/i),
    ).toBeInTheDocument();
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
  source: "MANUAL",
  sourceWorkflow: null,
  scheduledAt: new Date("2026-06-10T15:00:00Z"),
  lifeSafety: false,
  departments: [{ id: "d-it", name: "IT", color: "purple" }],
  assignee: { id: "u1", name: "Alice", email: "alice@example.com" },
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

  it("navigates to the ticket detail page when a row is clicked", async () => {
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
});
