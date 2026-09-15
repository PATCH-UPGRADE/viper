import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformEnum, SyncStatusEnum } from "@/generated/prisma";

const {
  mockMutate,
  mockUseRemoveIntegration,
  mockUseSetIntegrationEnabled,
  mockUseSetResourceSyncEnabled,
  mockUseTriggerSync,
  mockUseCreateIntegration,
  mockUseUpdateIntegration,
} = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockUseRemoveIntegration: vi.fn(),
  mockUseSetIntegrationEnabled: vi.fn(),
  mockUseSetResourceSyncEnabled: vi.fn(),
  mockUseTriggerSync: vi.fn(),
  mockUseCreateIntegration: vi.fn(),
  mockUseUpdateIntegration: vi.fn(),
}));

vi.mock("../hooks/use-integrations", () => ({
  useRemoveIntegration: mockUseRemoveIntegration,
  useSetIntegrationEnabled: mockUseSetIntegrationEnabled,
  useSetResourceSyncEnabled: mockUseSetResourceSyncEnabled,
  useTriggerSync: mockUseTriggerSync,
  useCreateIntegration: mockUseCreateIntegration,
  useUpdateIntegration: mockUseUpdateIntegration,
}));

import type { CatalogEntry } from "../core/catalog";
import type { IntegrationListItem } from "../types";
import { IntegrationCard } from "./integration-row";

const idleMutation = { mutate: mockMutate, isPending: false };

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRemoveIntegration.mockReturnValue(idleMutation);
  mockUseSetIntegrationEnabled.mockReturnValue(idleMutation);
  mockUseSetResourceSyncEnabled.mockReturnValue(idleMutation);
  mockUseTriggerSync.mockReturnValue(idleMutation);
  mockUseCreateIntegration.mockReturnValue(idleMutation);
  mockUseUpdateIntegration.mockReturnValue(idleMutation);
});

const catalogEntry: CatalogEntry = {
  platform: PlatformEnum.PARTNER,
  displayName: "Partner API",
  description: "",
  categories: [],
  configFields: [{ key: "integrationUri", kind: "url", required: true }],
  credentialFields: [],
  credentialsAreAuthShaped: true,
};

const integration = {
  id: "integration-1",
  name: "My Partner Feed",
  platform: PlatformEnum.PARTNER,
  platformLabel: "Partner API",
  categories: [],
  enabled: true,
  syncEvery: 600,
  config: { integrationUri: "https://partner.example", resource: "Asset" },
  resourceSyncs: [
    {
      integrationId: "integration-1",
      resource: "Asset",
      status: SyncStatusEnum.Success,
      errorMessage: null,
      lastAttemptAt: null,
      lastSuccessfulSync: null,
      nextSyncAt: null,
      enabled: true,
      syncEvery: null,
      effectiveSyncEvery: 600,
      isOverridden: true,
      isDue: false,
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

  it("opens the edit dialog pre-filled with the integration's name, credentials left blank", async () => {
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
});
