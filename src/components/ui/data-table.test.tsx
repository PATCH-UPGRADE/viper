import { type Column, createColumnHelper } from "@tanstack/react-table";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaginatedResponse } from "@/lib/pagination";
import { DataTable, SortableHeader } from "./data-table";

interface TestData {
  id: string;
  name: string;
  email: string;
  status: string;
}

const columnHelper = createColumnHelper<TestData>();

const mockColumns = [
  columnHelper.accessor("id", {
    header: "ID",
    meta: { title: "ID" },
  }),
  columnHelper.accessor("name", {
    header: ({ column }) => <SortableHeader header="Name" column={column} />,
    meta: { title: "Name" },
  }),
  columnHelper.accessor("email", {
    header: ({ column }) => <SortableHeader header="Email" column={column} />,
    meta: { title: "Email" },
  }),
  columnHelper.accessor("status", {
    header: "Status",
    meta: { title: "Status" },
  }),
];

const mockData: TestData[] = [
  { id: "1", name: "John Doe", email: "john@example.com", status: "active" },
  {
    id: "2",
    name: "Jane Smith",
    email: "jane@example.com",
    status: "inactive",
  },
  { id: "3", name: "Bob Johnson", email: "bob@example.com", status: "active" },
];

const mockPaginatedData: PaginatedResponse<TestData> = {
  items: mockData,
  page: 1,
  pageSize: 10,
  totalCount: 3,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

describe("DataTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders table with data", () => {
    render(
      <DataTable columns={mockColumns} paginatedData={mockPaginatedData} />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Johnson")).toBeInTheDocument();
  });

  it("renders column headers correctly", () => {
    render(
      <DataTable columns={mockColumns} paginatedData={mockPaginatedData} />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );

    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(4); // ID, Name, Email, Status
    expect(
      screen.getByRole("columnheader", { name: /ID/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("columnheader", { name: /Name/i })[0],
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("columnheader", { name: /Email/i })[0],
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /Status/i }),
    ).toBeInTheDocument();
  });

  it("displays loading state", () => {
    render(
      <DataTable
        columns={mockColumns}
        paginatedData={{ ...mockPaginatedData, items: [] }}
        isLoading={true}
      />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("displays no results message when data is empty", () => {
    render(
      <DataTable
        columns={mockColumns}
        paginatedData={{ ...mockPaginatedData, items: [] }}
        isLoading={false}
      />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );

    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("renders search component when provided", () => {
    const searchComponent = <input placeholder="Search..." />;

    render(
      <DataTable
        columns={mockColumns}
        paginatedData={mockPaginatedData}
        search={searchComponent}
      />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );

    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("opens column visibility dropdown", async () => {
    const user = userEvent.setup();

    render(
      <DataTable columns={mockColumns} paginatedData={mockPaginatedData} />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );

    const columnsButton = screen.getByRole("button", { name: /columns/i });
    await user.click(columnsButton);

    await waitFor(() => {
      const checkboxes = screen.getAllByRole("menuitemcheckbox");
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });

  it("calls rowOnclick when row is clicked", async () => {
    const user = userEvent.setup();
    const handleRowClick = vi.fn();

    render(
      <DataTable
        columns={mockColumns}
        paginatedData={mockPaginatedData}
        rowOnclick={handleRowClick}
      />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );

    const firstRow = screen.getByText("John Doe").closest("tr");
    if (firstRow) {
      await user.click(firstRow);
    }

    expect(handleRowClick).toHaveBeenCalledTimes(1);
  });

  it("displays correct pagination info", () => {
    render(
      <DataTable columns={mockColumns} paginatedData={mockPaginatedData} />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );

    expect(screen.getByText(/Page 1 of 1/i)).toBeInTheDocument();
  });

  it("renders pagination controls", () => {
    render(
      <DataTable columns={mockColumns} paginatedData={mockPaginatedData} />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );

    expect(
      screen.getByRole("button", { name: /go to first page/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /go to previous page/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /go to next page/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /go to last page/i }),
    ).toBeInTheDocument();
  });

  it("disables previous page buttons on first page", () => {
    render(
      <DataTable columns={mockColumns} paginatedData={mockPaginatedData} />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );

    const prevButton = screen.getByRole("button", {
      name: /go to previous page/i,
    });
    const firstButton = screen.getByRole("button", {
      name: /go to first page/i,
    });

    expect(prevButton).toBeDisabled();
    expect(firstButton).toBeDisabled();
  });

  it("disables next page buttons on last page", () => {
    render(
      <DataTable columns={mockColumns} paginatedData={mockPaginatedData} />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );
    const nextButton = screen.getByRole("button", { name: /go to next page/i });
    const lastButton = screen.getByRole("button", { name: /go to last page/i });

    expect(nextButton).toBeDisabled();
    expect(lastButton).toBeDisabled();
  });

  it("renders rows per page selector", () => {
    render(
      <DataTable columns={mockColumns} paginatedData={mockPaginatedData} />,
      {
        wrapper: withNuqsTestingAdapter(),
      },
    );

    expect(screen.getByText("Rows per page")).toBeInTheDocument();
  });
});

describe("SortableHeader", () => {
  it("renders header text", () => {
    const mockColumn: Partial<Column<TestData, unknown>> = {
      getIsSorted: () => false,
      toggleSorting: vi.fn(),
    };

    render(
      <SortableHeader
        header="Test Header"
        column={mockColumn as Column<TestData, unknown>}
      />,
    );

    expect(screen.getByText("Test Header")).toBeInTheDocument();
  });

  it("shows unsorted icon by default", () => {
    const mockColumn: Partial<Column<TestData, unknown>> = {
      getIsSorted: () => false,
      toggleSorting: vi.fn(),
    };

    const { getByLabelText } = render(
      <SortableHeader
        header="clickable header"
        column={mockColumn as Column<TestData, unknown>}
      />,
    );

    const button = getByLabelText("Sort clickable header neutral");
    expect(button).toBeInTheDocument();
  });

  it("shows ascending arrow when sorted ascending", () => {
    const mockColumn: Partial<Column<TestData, unknown>> = {
      getIsSorted: () => "asc",
      toggleSorting: vi.fn(),
    };

    const { getByLabelText } = render(
      <SortableHeader
        header="Test Header"
        column={mockColumn as Column<TestData, unknown>}
      />,
    );

    const button = getByLabelText("Sort Test Header descending");
    expect(button).toBeInTheDocument();
    expect(button.querySelector("svg")).toBeInTheDocument();
  });

  it("shows descending arrow when sorted descending", () => {
    const mockColumn: Partial<Column<TestData, unknown>> = {
      getIsSorted: () => "desc",
      toggleSorting: vi.fn(),
    };

    const { getByLabelText } = render(
      <SortableHeader
        header="Test Header"
        column={mockColumn as Column<TestData, unknown>}
      />,
    );

    const button = getByLabelText("Sort Test Header ascending");
    expect(button).toBeInTheDocument();
    expect(button.querySelector("svg")).toBeInTheDocument();
  });

  it("calls toggleSorting when clicked", async () => {
    const user = userEvent.setup();
    const toggleSorting = vi.fn();
    const mockColumn: Partial<Column<TestData, unknown>> = {
      getIsSorted: () => false,
      toggleSorting,
    };

    const { container } = render(
      <SortableHeader
        header="clickable header"
        column={mockColumn as Column<TestData, unknown>}
      />,
    );

    const button = within(container).getByRole("button");
    await user.click(button);

    expect(toggleSorting).toHaveBeenCalledWith(undefined, true);
  });
});
