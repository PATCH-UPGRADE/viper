import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlatformEnum } from "@/generated/prisma";
import type { CatalogEntry } from "../core/catalog";
import { IntegrationsCatalog } from "./integrations-catalog";

const mockAddedPlatforms = vi.fn<() => PlatformEnum[]>();
vi.mock("../hooks/use-integrations", () => ({
  useAddedPlatforms: () => mockAddedPlatforms(),
  useCreateIntegration: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateIntegration: () => ({ mutate: vi.fn(), isPending: false }),
}));

const entry = (
  platform: PlatformEnum,
  displayName: string,
  singleton: boolean,
): CatalogEntry => ({
  platform,
  displayName,
  description: "",
  categories: ["Notifications"],
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

const cardOrder = () => {
  const { container } = render(
    <IntegrationsCatalog catalog={catalog} register={() => () => {}} />,
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
    mockAddedPlatforms.mockReturnValue([]);
    expect(cardOrder()).toEqual([
      "MedISAO",
      "Partner API",
      "Siemens Healthineers",
    ]);
  });

  it("moves an added singleton to the end of its section", () => {
    mockAddedPlatforms.mockReturnValue([PlatformEnum.MEDISAO]);
    expect(cardOrder()).toEqual([
      "Partner API",
      "Siemens Healthineers",
      "MedISAO",
    ]);
    expect(screen.getByRole("button", { name: "Added" })).toBeDisabled();
  });

  it("does not move a platform that can take many integrations", () => {
    mockAddedPlatforms.mockReturnValue([PlatformEnum.PARTNER]);
    expect(cardOrder()).toEqual([
      "MedISAO",
      "Partner API",
      "Siemens Healthineers",
    ]);
  });
});
