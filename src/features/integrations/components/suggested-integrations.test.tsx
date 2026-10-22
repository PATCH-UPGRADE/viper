import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlatformEnum } from "@/generated/prisma";
import type { CatalogEntry } from "../core/catalog";
import { SuggestedIntegrations } from "./suggested-integrations";

const mockSuggestions =
  vi.fn<() => { platform: PlatformEnum; reason: string }[]>();
vi.mock("../hooks/use-integrations", () => ({
  useSuspenseIntegrationSuggestions: () => ({ data: mockSuggestions() }),
  useCreateIntegration: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateIntegration: () => ({ mutate: vi.fn(), isPending: false }),
}));

const fleet: CatalogEntry = {
  platform: PlatformEnum.FLEET,
  displayName: "Siemens Healthineers",
  description: "Sync device and service data from teamplay Fleet.",
  categories: ["Hospital Inventory"],
  singleton: true,
  unscheduled: false,
  configFields: [],
  credentialFields: [],
  credentialsAreAuthShaped: false,
};

describe("SuggestedIntegrations", () => {
  it("renders nothing when no platform is suggested", () => {
    mockSuggestions.mockReturnValue([]);
    const { container } = render(<SuggestedIntegrations catalog={[fleet]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a suggestion with no catalog entry", () => {
    mockSuggestions.mockReturnValue([
      { platform: PlatformEnum.MEDISAO, reason: "no card" },
    ]);
    const { container } = render(<SuggestedIntegrations catalog={[fleet]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a card with the reason and an enabled Add button", () => {
    mockSuggestions.mockReturnValue([
      { platform: PlatformEnum.FLEET, reason: "We found 12 assets." },
    ]);
    render(<SuggestedIntegrations catalog={[fleet]} />);

    expect(screen.getByText("Suggested for you")).toBeInTheDocument();
    expect(screen.getByText("Suggested integration")).toBeInTheDocument();
    expect(screen.getByText("Siemens Healthineers")).toBeInTheDocument();
    expect(screen.getByText("We found 12 assets.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });
});
