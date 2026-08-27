import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMutate, mockUseSuspenseDebrief, mockIsPending } = vi.hoisted(
  () => ({
    mockMutate: vi.fn(),
    mockUseSuspenseDebrief: vi.fn(),
    mockIsPending: { value: false },
  }),
);

vi.mock("../hooks/use-debrief", () => ({
  useSuspenseDebrief: mockUseSuspenseDebrief,
  useRegenerateDebrief: () => ({
    mutate: mockMutate,
    isPending: mockIsPending.value,
  }),
}));

import { DebriefCard } from "./debrief-card";

type Debrief = NonNullable<
  ReturnType<typeof import("../hooks/use-debrief").useSuspenseDebrief>["data"]
>;

const VULN_LINK = {
  label: "Nephrotek Renastar bypass",
  entityType: "vulnerability" as const,
  entityId: "vuln-1",
};

const makeDebrief = (overrides: Partial<Debrief> = {}): Debrief =>
  ({
    id: "debrief-1",
    department: { id: "dept-1", name: "Biomedical Engineering" },
    viewerFirstName: "Cassidy",
    status: "Ready",
    bullets: [
      { text: "Two machines are exposed by {{0}}.", links: [VULN_LINK] },
      { text: "Facilities is buying 24 infusion pumps.", links: [] },
    ],
    since: null,
    generatedAt: new Date("2026-08-26T11:24:00.000Z"),
    ...overrides,
  }) as Debrief;

const setDebrief = (data: Debrief | null) =>
  mockUseSuspenseDebrief.mockReturnValue({ data });

beforeEach(() => {
  vi.clearAllMocks();
  mockIsPending.value = false;
});

describe("DebriefCard — what the reader sees", () => {
  it("renders each bullet, with markers replaced by links", () => {
    setDebrief(makeDebrief());
    render(<DebriefCard />);

    const link = screen.getByRole("link", {
      name: "Nephrotek Renastar bypass",
    });
    expect(link).toHaveAttribute("href", "/vulnerabilities/vuln-1");
    expect(
      screen.getByText(/Facilities is buying 24 infusion pumps/),
    ).toBeInTheDocument();
  });

  it("never shows a raw placeholder to the reader", () => {
    // A literal "{{0}}" in a clinical brief is worse than a missing link.
    setDebrief(makeDebrief());
    const { container } = render(<DebriefCard />);

    expect(container.textContent).not.toContain("{{");
  });

  it("addresses the reader by first name", async () => {
    setDebrief(makeDebrief());
    render(<DebriefCard />);

    expect(
      screen.getByText(/Personalized brief for Cassidy/),
    ).toBeInTheDocument();
  });

  it("falls back to the department when there is no display name", async () => {
    // The API-key auth path carries an id but no name, so the card must not
    // greet an empty string.
    setDebrief(makeDebrief({ viewerFirstName: null }));
    render(<DebriefCard />);

    expect(
      screen.getByText(/Personalized brief for Biomedical Engineering/),
    ).toBeInTheDocument();
  });

  it("carries the AI provenance notice", () => {
    setDebrief(makeDebrief());
    render(<DebriefCard />);

    expect(screen.getByText(/may contain mistakes/)).toBeInTheDocument();
  });

  it("renders a bullet whose links were all dropped", () => {
    // validateBullets inlines a dropped link's label, so this is a normal
    // shape, not an edge case.
    setDebrief(
      makeDebrief({
        bullets: [{ text: "Exposed by the Nephrotek flaw.", links: [] }],
      }),
    );
    render(<DebriefCard />);

    expect(
      screen.getByText(/Exposed by the Nephrotek flaw/),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("DebriefCard — states", () => {
  it("renders nothing when the user has no department", () => {
    // An empty shell tells the reader less than no card at all.
    setDebrief(null);
    const { container } = render(<DebriefCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows a generating state instead of bullets", () => {
    setDebrief(makeDebrief({ status: "Generating", bullets: [] }));
    render(<DebriefCard />);

    expect(screen.getByText(/Generating your debrief/)).toBeInTheDocument();
  });

  it("says the previous brief is unchanged when a run failed", () => {
    setDebrief(makeDebrief({ status: "Failed", bullets: [] }));
    render(<DebriefCard />);

    expect(screen.getByText(/could not be generated/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });
});

describe("DebriefCard — regenerate", () => {
  it("queues a run when clicked", async () => {
    setDebrief(makeDebrief());
    render(<DebriefCard />);

    await userEvent.click(
      screen.getByRole("button", { name: /regenerate debrief/i }),
    );

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("cannot be clicked twice while a run is in flight", async () => {
    // The server dedupes too, but a disabled control is the honest signal.
    setDebrief(makeDebrief({ status: "Generating", bullets: [] }));
    render(<DebriefCard />);

    const button = screen.getByRole("button", { name: /regenerate debrief/i });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(mockMutate).not.toHaveBeenCalled();
  });
});

describe("DebriefCard — collapse", () => {
  it("hides the bullets and reports its state to assistive tech", async () => {
    setDebrief(makeDebrief());
    render(<DebriefCard />);

    const toggle = screen.getByRole("button", { name: /collapse debrief/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(toggle);

    expect(screen.queryByText(/Facilities is buying/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /expand debrief/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
