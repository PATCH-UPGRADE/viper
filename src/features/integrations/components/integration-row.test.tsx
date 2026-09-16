import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformEnum, SyncStatusEnum } from "@/generated/prisma";

const {
  mockUseRemoveIntegration,
  mockUseSetIntegrationEnabled,
  mockUseTriggerSync,
  mockUseCreateIntegration,
  mockUseUpdateIntegration,
} = vi.hoisted(() => ({
  mockUseRemoveIntegration: vi.fn(),
  mockUseSetIntegrationEnabled: vi.fn(),
  mockUseTriggerSync: vi.fn(),
  mockUseCreateIntegration: vi.fn(),
  mockUseUpdateIntegration: vi.fn(),
}));

vi.mock("../hooks/use-integrations", () => ({
  useRemoveIntegration: mockUseRemoveIntegration,
  useSetIntegrationEnabled: mockUseSetIntegrationEnabled,
  useTriggerSync: mockUseTriggerSync,
  useCreateIntegration: mockUseCreateIntegration,
  useUpdateIntegration: mockUseUpdateIntegration,
}));

import type { CatalogEntry } from "../core/catalog";
import type { IntegrationListItem } from "../types";
import { IntegrationCard } from "./integration-row";

beforeEach(() => {
  vi.clearAllMocks();
  const idleMutation = { mutate: vi.fn(), isPending: false };
  mockUseRemoveIntegration.mockReturnValue(idleMutation);
  mockUseSetIntegrationEnabled.mockReturnValue(idleMutation);
  mockUseTriggerSync.mockReturnValue(idleMutation);
  mockUseCreateIntegration.mockReturnValue(idleMutation);
  mockUseUpdateIntegration.mockReturnValue(idleMutation);
});

const catalogEntry = {
  platform: PlatformEnum.PARTNER,
  displayName: "Partner API",
  configFields: [],
  credentialFields: [],
  credentialsAreAuthShaped: true,
} as unknown as CatalogEntry;

const integration = {
  id: "integration-1",
  name: "My Partner Feed",
  platform: PlatformEnum.PARTNER,
  enabled: true,
  resourceSyncs: [
    {
      resource: "Asset",
      enabled: true,
      status: SyncStatusEnum.Success,
      effectiveSyncEvery: 300,
      isOverridden: false,
    },
  ],
} as unknown as IntegrationListItem;

describe("IntegrationActionsMenu edit item", () => {
  it("does not show Edit Integration without a matching catalog entry", async () => {
    const user = userEvent.setup();
    render(<IntegrationCard integration={integration} />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));

    expect(
      screen.queryByRole("menuitem", { name: /edit integration/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the edit dialog titled for the platform, pre-filled with the integration's name", async () => {
    const user = userEvent.setup();
    render(
      <IntegrationCard integration={integration} catalogEntry={catalogEntry} />,
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    await user.click(
      screen.getByRole("menuitem", { name: /edit integration/i }),
    );

    expect(
      screen.getByRole("heading", { name: "Edit Partner API" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("My Partner Feed")).toBeInTheDocument();
  });

  it("leaves a flat platform's credential field blank, never showing the real stored value", async () => {
    const flatCatalogEntry = {
      ...catalogEntry,
      credentialsAreAuthShaped: false,
      credentialFields: [{ key: "apiToken", kind: "password", required: true }],
    } as CatalogEntry;
    const user = userEvent.setup();
    render(
      <IntegrationCard
        integration={integration}
        catalogEntry={flatCatalogEntry}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    await user.click(
      screen.getByRole("menuitem", { name: /edit integration/i }),
    );

    expect(screen.getByLabelText(/api token/i)).toHaveValue("");
  });
});
