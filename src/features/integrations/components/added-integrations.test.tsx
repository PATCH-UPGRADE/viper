import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformEnum, ResourceType, SyncStatusEnum } from "@/generated/prisma";
import type { CatalogEntry } from "../core/catalog";
import type { IntegrationListItem } from "../types";

const { mockPlatformIntegrations } = vi.hoisted(() => ({
  mockPlatformIntegrations: vi.fn(),
}));

vi.mock("../hooks/use-integrations", () => {
  const idle = () => ({ mutate: vi.fn(), isPending: false });
  return {
    usePlatformIntegrations: mockPlatformIntegrations,
    useCreateIntegration: idle,
    useUpdateIntegration: idle,
    useRemoveIntegration: idle,
    useSetIntegrationEnabled: idle,
    useSetResourceSyncEnabled: idle,
    useTriggerSync: idle,
  };
});

import { AddedIntegrations } from "./added-integrations";

const entry = {
  platform: PlatformEnum.SERVICENOW,
  displayName: "ServiceNow",
  categories: ["Ticketing Platforms"],
  singleton: false,
  unscheduled: false,
  configFields: [],
  credentialFields: [],
  credentialsAreAuthShaped: true,
} as unknown as CatalogEntry;

const serviceNow = (
  id: string,
  name: string,
  status: SyncStatusEnum = SyncStatusEnum.Success,
) =>
  ({
    id,
    name,
    platform: PlatformEnum.SERVICENOW,
    platformLabel: "ServiceNow",
    categories: ["Ticketing Platforms"],
    enabled: true,
    syncEvery: null,
    config: {},
    recordCounts: {
      Asset: 0,
      Vulnerability: 0,
      DeviceArtifact: 0,
      Remediation: 0,
      WorkOrder: 3,
      SourceRecord: 0,
    },
    resourceSyncs: [
      {
        integrationId: id,
        resource: ResourceType.WorkOrder,
        status,
        errorMessage: status === SyncStatusEnum.Error ? "401" : null,
        warningMessage: null,
        lastAttemptAt: new Date(),
        lastSuccessfulSync: new Date(),
        nextSyncAt: null,
        enabled: true,
        syncEvery: null,
        effectiveSyncEvery: 3600,
        isOverridden: false,
        isDue: false,
      },
    ],
  }) as unknown as IntegrationListItem;

beforeEach(() => {
  mockPlatformIntegrations.mockReset();
});

describe("AddedIntegrations", () => {
  it("opens the only integration straight into the edit form", async () => {
    mockPlatformIntegrations.mockReturnValue([serviceNow("a", "Main desk")]);
    const user = userEvent.setup();
    render(<AddedIntegrations entry={entry} />);

    expect(screen.getByText(/1 added/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Main desk" }));

    expect(
      screen.getByRole("heading", { name: "Edit ServiceNow" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Main desk")).toBeInTheDocument();
  });

  it("lists several integrations first, then edits the one picked", async () => {
    mockPlatformIntegrations.mockReturnValue([
      serviceNow("a", "Main desk"),
      serviceNow("b", "Biomed desk", SyncStatusEnum.Error),
    ]);
    const user = userEvent.setup();
    render(<AddedIntegrations entry={entry} />);

    expect(screen.getByText(/2 added/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Edit ServiceNow integrations" }),
    );

    expect(
      screen.getByText("2 integrations. Choose one to edit."),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/desk/)).not.toBeInTheDocument();
    const biomed = screen.getByRole("button", { name: /Biomed desk/ });
    expect(biomed).toHaveTextContent("Failing");
    expect(biomed).toHaveTextContent("3 work orders");

    await user.click(biomed);

    expect(
      screen.queryByText("2 integrations. Choose one to edit."),
    ).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Biomed desk")).toBeInTheDocument();
  });

  it("shows nothing when the platform has no integrations", () => {
    mockPlatformIntegrations.mockReturnValue([]);
    const { container } = render(<AddedIntegrations entry={entry} />);
    expect(container).toBeEmptyDOMElement();
  });
});
