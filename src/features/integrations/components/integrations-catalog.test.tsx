import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlatformEnum } from "@/generated/prisma";
import type { CatalogEntry } from "../core/catalog";
import { IntegrationsCatalog } from "./integrations-catalog";

const mockAddedPlatformCounts =
  vi.fn<() => Partial<Record<PlatformEnum, number>>>();
vi.mock("../hooks/use-integrations", () => ({
  useAddedPlatformCounts: () => mockAddedPlatformCounts(),
  usePlatformIntegrations: (platform: PlatformEnum) =>
    Array.from(
      { length: mockAddedPlatformCounts()[platform] ?? 0 },
      (_, i) => ({ id: `${platform}-${i}`, name: `${platform} ${i}` }),
    ),
  useCreateIntegration: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateIntegration: () => ({ mutate: vi.fn(), isPending: false }),
}));

const entry = (
  platform: PlatformEnum,
  displayName: string,
  singleton: boolean,
  categories: CatalogEntry["categories"] = ["Notifications"],
): CatalogEntry => ({
  platform,
  displayName,
  description: `${displayName} description`,
  categories,
  singleton,
  unscheduled: false,
  configFields: [],
  credentialFields: [],
  credentialsAreAuthShaped: false,
});

const catalog = [
  entry(PlatformEnum.MEDISAO, "MedISAO", true),
  entry(PlatformEnum.PARTNER, "Partner API", false),
  entry(PlatformEnum.FLEET, "Siemens Healthineers", true),
];

const allFilter = { category: "all", query: "" } as const;

const cardOrder = () => {
  const { container } = render(
    <IntegrationsCatalog catalog={catalog} filter={allFilter} />,
  );
  const section = container.querySelector<HTMLElement>(
    '[data-section="Notifications"]',
  );
  if (!section) throw new Error("Notifications section not found");
  return within(section)
    .getAllByText(/^(MedISAO|Partner API|Siemens Healthineers)$/)
    .map((el) => el.textContent);
};

describe("IntegrationsCatalog order", () => {
  it("keeps catalog order when nothing is added", () => {
    mockAddedPlatformCounts.mockReturnValue({});
    expect(cardOrder()).toEqual([
      "MedISAO",
      "Partner API",
      "Siemens Healthineers",
    ]);
  });

  it("moves an added singleton to the end of its section", () => {
    mockAddedPlatformCounts.mockReturnValue({ [PlatformEnum.MEDISAO]: 1 });
    expect(cardOrder()).toEqual([
      "Partner API",
      "Siemens Healthineers",
      "MedISAO",
    ]);
    expect(screen.getByRole("button", { name: "Added" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Edit MEDISAO 0" }),
    ).toBeEnabled();
    expect(screen.queryByText(/1 added/)).not.toBeInTheDocument();
  });

  it("does not move a platform that can take many integrations", () => {
    mockAddedPlatformCounts.mockReturnValue({ [PlatformEnum.PARTNER]: 2 });
    expect(cardOrder()).toEqual([
      "MedISAO",
      "Partner API",
      "Siemens Healthineers",
    ]);
    expect(screen.getByText("2 added")).toBeInTheDocument();
  });
});

describe("IntegrationsCatalog filter", () => {
  const mixed = [
    ...catalog,
    entry(PlatformEnum.SERVICENOW, "ServiceNow", false, [
      "Ticketing Platforms",
    ]),
  ];

  it("shows only the chosen category's section", () => {
    mockAddedPlatformCounts.mockReturnValue({});
    render(
      <IntegrationsCatalog
        catalog={mixed}
        filter={{ category: "Ticketing Platforms", query: "" }}
      />,
    );
    expect(screen.getByText("ServiceNow")).toBeInTheDocument();
    expect(screen.queryByText("MedISAO")).not.toBeInTheDocument();
  });

  it("matches the search against names and descriptions, and drops empty sections", () => {
    mockAddedPlatformCounts.mockReturnValue({});
    render(
      <IntegrationsCatalog
        catalog={mixed}
        filter={{ category: "all", query: "partner api desc" }}
      />,
    );
    expect(screen.getByText("Partner API")).toBeInTheDocument();
    expect(screen.queryByText("MedISAO")).not.toBeInTheDocument();
    expect(screen.queryByText("Ticketing Platforms")).not.toBeInTheDocument();
  });
});
