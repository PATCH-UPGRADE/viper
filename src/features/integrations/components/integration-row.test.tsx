import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformEnum, SyncStatusEnum } from "@/generated/prisma";

const {
  mockUseRemoveIntegration,
  mockUseSetIntegrationEnabled,
  mockUseSetResourceSyncEnabled,
  mockUseTriggerSync,
  mockUseCreateIntegration,
  mockUseUpdateIntegration,
} = vi.hoisted(() => ({
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
import { IntegrationActionsMenu, StreamActionsMenu } from "./integration-row";

beforeEach(() => {
  vi.clearAllMocks();
  const idleMutation = { mutate: vi.fn(), isPending: false };
  mockUseRemoveIntegration.mockReturnValue(idleMutation);
  mockUseSetIntegrationEnabled.mockReturnValue(idleMutation);
  mockUseSetResourceSyncEnabled.mockReturnValue(idleMutation);
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
    render(<IntegrationActionsMenu integration={integration} />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));

    expect(
      screen.queryByRole("menuitem", { name: /edit integration/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the edit dialog titled for the platform, pre-filled with the integration's name", async () => {
    const user = userEvent.setup();
    render(
      <IntegrationActionsMenu
        integration={integration}
        catalogEntry={catalogEntry}
      />,
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
      <IntegrationActionsMenu
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

describe("pausing", () => {
  it("pauses a running integration from its menu", async () => {
    const mutate = vi.fn();
    mockUseSetIntegrationEnabled.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();
    render(<IntegrationActionsMenu integration={integration} />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    await user.click(screen.getByRole("menuitem", { name: "Pause Sync" }));

    expect(mutate).toHaveBeenCalledWith(
      { id: "integration-1", enabled: false },
      expect.anything(),
    );
  });

  it("resumes a paused integration, and cannot sync it meanwhile", async () => {
    const mutate = vi.fn();
    mockUseSetIntegrationEnabled.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();
    render(
      <IntegrationActionsMenu
        integration={{ ...integration, enabled: false }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    expect(screen.getByRole("menuitem", { name: "Sync Now" })).toHaveAttribute(
      "data-disabled",
    );
    await user.click(screen.getByRole("menuitem", { name: "Resume Sync" }));

    expect(mutate).toHaveBeenCalledWith(
      { id: "integration-1", enabled: true },
      expect.anything(),
    );
  });

  it("does not offer pausing for an upload", async () => {
    const user = userEvent.setup();
    render(
      <IntegrationActionsMenu
        integration={integration}
        catalogEntry={{ ...catalogEntry, unscheduled: true }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    expect(
      screen.queryByRole("menuitem", { name: /pause sync/i }),
    ).not.toBeInTheDocument();
  });

  it("pauses one stream on its own", async () => {
    const mutate = vi.fn();
    mockUseSetResourceSyncEnabled.mockReturnValue({ mutate, isPending: false });
    const sync = {
      ...integration.resourceSyncs[0],
      integrationId: "integration-1",
    };
    const user = userEvent.setup();
    render(<StreamActionsMenu integration={integration} sync={sync} />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    await user.click(screen.getByRole("menuitem", { name: "Pause Sync" }));

    expect(mutate).toHaveBeenCalledWith(
      { integrationId: "integration-1", resource: "Asset", enabled: false },
      expect.anything(),
    );
  });

  it("offers Resume, not Pause, when the integration is on but every stream is off", async () => {
    const mutate = vi.fn();
    mockUseSetIntegrationEnabled.mockReturnValue({ mutate, isPending: false });
    const everyStreamOff = {
      ...integration,
      resourceSyncs: integration.resourceSyncs.map((sync) => ({
        ...sync,
        enabled: false,
      })),
    };
    const user = userEvent.setup();
    render(<IntegrationActionsMenu integration={everyStreamOff} />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    expect(
      screen.queryByRole("menuitem", { name: "Pause Sync" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Resume Sync" }));

    expect(mutate).toHaveBeenCalledWith(
      { id: "integration-1", enabled: true },
      expect.anything(),
    );
  });

  it("cannot resume a stream while its whole integration is paused, and says why", async () => {
    const user = userEvent.setup();
    const paused = { ...integration, enabled: false };
    render(
      <StreamActionsMenu integration={paused} sync={paused.resourceSyncs[0]} />,
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    const resume = screen.getByRole("menuitem", { name: /^Resume Sync/ });
    expect(resume).toHaveAttribute("data-disabled");
    expect(resume).toHaveTextContent("Resume My Partner Feed first");
  });

  it("gives a stream no hint while its integration is running", async () => {
    const user = userEvent.setup();
    render(
      <StreamActionsMenu
        integration={integration}
        sync={integration.resourceSyncs[0]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    expect(
      screen.getByRole("menuitem", { name: "Pause Sync" }),
    ).not.toHaveTextContent("first");
  });
});
