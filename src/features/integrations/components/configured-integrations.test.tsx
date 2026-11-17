import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlatformEnum, ResourceType, SyncStatusEnum } from "@/generated/prisma";
import type { CatalogEntry } from "../core/catalog";
import type {
  IntegrationListItem,
  IntegrationResourceSyncItem,
} from "../types";

vi.mock("../hooks/use-integrations", () => {
  const idle = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useRemoveIntegration: idle,
    useSetIntegrationEnabled: idle,
    useSetResourceSyncEnabled: idle,
    useTriggerSync: idle,
    useCreateIntegration: idle,
    useUpdateIntegration: idle,
  };
});

import {
  ConfiguredIntegrationsTable,
  StatusBadge,
} from "./configured-integrations";
import { configuredRowsFor } from "./configured-rows";

const counts = {
  Asset: 128,
  WorkOrder: 0,
  SourceRecord: 14,
  Vulnerability: 0,
  DeviceArtifact: 0,
  Remediation: 0,
};

const sync = (
  overrides: Partial<IntegrationResourceSyncItem>,
): IntegrationResourceSyncItem => ({
  integrationId: "fleet",
  resource: ResourceType.Asset,
  status: SyncStatusEnum.Success,
  errorMessage: null,
  lastAttemptAt: new Date(),
  lastSuccessfulSync: new Date(),
  nextSyncAt: new Date(Date.now() + 10 * 60_000),
  enabled: true,
  syncEvery: null,
  effectiveSyncEvery: 3600,
  isOverridden: false,
  isDue: false,
  ...overrides,
});

const fleet = {
  id: "fleet",
  name: "teamplay Fleet",
  platform: PlatformEnum.FLEET,
  platformLabel: "Siemens Healthineers",
  categories: ["Hospital Inventory"],
  enabled: true,
  recordCounts: counts,
  resourceSyncs: [
    sync({ resource: ResourceType.Asset }),
    sync({ resource: ResourceType.SourceRecord, enabled: false }),
  ],
} as unknown as IntegrationListItem;

const partner = {
  id: "partner",
  name: "Blueflow",
  platform: PlatformEnum.PARTNER,
  platformLabel: "Partner API",
  categories: ["Hospital Inventory"],
  enabled: true,
  recordCounts: { ...counts, Asset: 0 },
  resourceSyncs: [
    sync({
      integrationId: "partner",
      status: SyncStatusEnum.Pending,
      lastSuccessfulSync: null,
    }),
  ],
} as unknown as IntegrationListItem;

const csvEntry = {
  platform: PlatformEnum.CSV_UPLOAD,
  displayName: "Spreadsheet Upload",
  categories: ["Hospital Inventory"],
  unscheduled: true,
  configFields: [],
  credentialFields: [],
} as unknown as CatalogEntry;

const upload = {
  id: "upload-1",
  name: "east-wing.csv",
  platform: PlatformEnum.CSV_UPLOAD,
  platformLabel: "Spreadsheet Upload",
  categories: ["Hospital Inventory"],
  enabled: true,
  recordCounts: { ...counts, Asset: 37 },
  resourceSyncs: [sync({ integrationId: "upload-1" })],
} as unknown as IntegrationListItem;

const renderTable = (integrations: IntegrationListItem[]) =>
  render(
    <ConfiguredIntegrationsTable
      rows={configuredRowsFor(integrations, [csvEntry])}
    />,
  );

const rowNamed = (name: string) => {
  const row = screen.getByText(name).closest("tr");
  if (!row) throw new Error(`no row for ${name}`);
  return within(row);
};

describe("StatusBadge", () => {
  it("underlines a failing badge that has an error to show", () => {
    render(<StatusBadge state="failing" errorMessage="401 Unauthorized" />);
    const badge = screen.getByRole("button", { name: "Failing" });
    expect(badge).toHaveClass("decoration-dotted");
  });

  it("does not underline a failing badge with no error message", () => {
    render(<StatusBadge state="failing" errorMessage={null} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Failing")).not.toHaveClass("decoration-dotted");
  });
});

describe("ConfiguredIntegrationsTable", () => {
  it("shows Unknown and zero records for an integration that never synced", () => {
    renderTable([partner]);
    const row = rowNamed("Blueflow");
    expect(row.getByText("Unknown")).toBeInTheDocument();
    expect(row.getByText("Never synced")).toBeInTheDocument();
    expect(row.getByText("0 assets")).toBeInTheDocument();
  });

  it("shows no schedule line for an integration with no streams yet", () => {
    renderTable([{ ...partner, resourceSyncs: [] }]);
    const row = rowNamed("Blueflow");
    expect(row.getByText("Never synced")).toBeInTheDocument();
    expect(row.queryByText(/^Every/)).not.toBeInTheDocument();
  });

  it("starts a multi-stream integration expanded, and collapses it", async () => {
    const user = userEvent.setup();
    renderTable([fleet]);

    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Collapse teamplay Fleet" }),
    );
    expect(screen.queryByText("Assets")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand teamplay Fleet" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("shows a paused stream with its interval but no next sync", () => {
    renderTable([fleet]);
    const paused = rowNamed("Notifications");
    expect(paused.getByText("Paused")).toBeInTheDocument();
    expect(paused.getByText("Every 1h")).toBeInTheDocument();
    expect(paused.getByText("14 notifications")).toBeInTheDocument();

    expect(
      rowNamed("Assets").getByText(/^Every 1h · next in/),
    ).toBeInTheDocument();
  });

  it("groups uploads under their platform, with no schedule", () => {
    renderTable([upload]);
    expect(
      rowNamed("Spreadsheet Upload").getByText("1 upload"),
    ).toBeInTheDocument();
    const uploadRow = rowNamed("east-wing.csv");
    expect(uploadRow.getByText(/^Uploaded /)).toBeInTheDocument();
    expect(uploadRow.getByText("37 assets")).toBeInTheDocument();
    expect(uploadRow.queryByText(/^Every/)).not.toBeInTheDocument();
  });
});
