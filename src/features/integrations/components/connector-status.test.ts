import { describe, expect, it } from "vitest";
import { PlatformEnum, ResourceType, SyncStatusEnum } from "@/generated/prisma";
import type {
  IntegrationListItem,
  IntegrationResourceSyncItem,
} from "../types";
import {
  integrationView,
  isPaused,
  recordLabel,
  streamView,
  uploadGroupView,
  uploadView,
} from "./connector-status";

const sync = (
  overrides: Partial<IntegrationResourceSyncItem> = {},
): IntegrationResourceSyncItem => ({
  integrationId: "integration-1",
  resource: ResourceType.Asset,
  status: SyncStatusEnum.Success,
  errorMessage: null,
  lastAttemptAt: null,
  lastSuccessfulSync: new Date("2026-08-20T10:00:00Z"),
  nextSyncAt: new Date("2026-08-20T11:00:00Z"),
  enabled: true,
  syncEvery: null,
  effectiveSyncEvery: 3600,
  isOverridden: false,
  isDue: false,
  ...overrides,
});

const integration = (
  resourceSyncs: IntegrationResourceSyncItem[],
  overrides: Partial<IntegrationListItem> = {},
): IntegrationListItem =>
  ({
    id: "integration-1",
    name: "teamplay",
    platform: PlatformEnum.FLEET,
    platformLabel: "Siemens Healthineers",
    categories: ["Hospital Inventory"],
    enabled: true,
    syncEvery: null,
    config: {},
    recordCounts: {
      Asset: 128,
      WorkOrder: 56,
      SourceRecord: 0,
      Vulnerability: 0,
      DeviceArtifact: 0,
      Remediation: 0,
    },
    resourceSyncs,
    ...overrides,
  }) as IntegrationListItem;

describe("streamView", () => {
  it("is healthy after a successful sync, with its schedule and records", () => {
    const item = integration([sync()]);
    expect(streamView(item, item.resourceSyncs[0])).toEqual({
      state: "healthy",
      errorMessage: null,
      lastAt: new Date("2026-08-20T10:00:00Z"),
      schedule: {
        every: [3600],
        nextSyncAt: new Date("2026-08-20T11:00:00Z"),
        isDue: false,
      },
      records: [{ resource: ResourceType.Asset, count: 128 }],
    });
  });

  it("is unknown when it has neither succeeded nor failed", () => {
    const item = integration([
      sync({ status: SyncStatusEnum.Pending, lastSuccessfulSync: null }),
    ]);
    expect(streamView(item, item.resourceSyncs[0]).state).toBe("unknown");
  });

  it("carries the error only while failing", () => {
    const item = integration([
      sync({ status: SyncStatusEnum.Error, errorMessage: "401 Unauthorized" }),
    ]);
    expect(streamView(item, item.resourceSyncs[0])).toMatchObject({
      state: "failing",
      errorMessage: "401 Unauthorized",
    });
  });

  it("is paused, with no next sync, when the stream or its integration is off", () => {
    const streamOff = integration([sync({ enabled: false, isDue: true })]);
    const integrationOff = integration([sync()], { enabled: false });

    for (const item of [streamOff, integrationOff]) {
      expect(streamView(item, item.resourceSyncs[0])).toMatchObject({
        state: "paused",
        schedule: { nextSyncAt: null, isDue: false },
      });
    }
  });

  it("hides a stale error once paused", () => {
    const item = integration([
      sync({
        status: SyncStatusEnum.Error,
        errorMessage: "timed out",
        enabled: false,
      }),
    ]);
    expect(streamView(item, item.resourceSyncs[0]).errorMessage).toBeNull();
  });
});

describe("integrationView", () => {
  const assets = sync();
  const workOrders = sync({
    resource: ResourceType.WorkOrder,
    status: SyncStatusEnum.Error,
    errorMessage: "504 Gateway timeout",
    lastSuccessfulSync: new Date("2026-08-19T10:00:00Z"),
    nextSyncAt: new Date("2026-08-20T10:30:00Z"),
  });
  const notifications = sync({
    resource: ResourceType.SourceRecord,
    enabled: false,
    effectiveSyncEvery: 86_400,
    nextSyncAt: new Date("2026-08-20T10:05:00Z"),
  });

  it("is one stream's view when there is only one, plus records of types it has no stream for", () => {
    const item = integration([assets]);
    expect(integrationView(item)).toEqual({
      ...streamView(item, assets),
      records: [
        { resource: ResourceType.Asset, count: 128 },
        { resource: ResourceType.WorkOrder, count: 56 },
      ],
    });
  });

  it("fails if any running stream fails, and says how many", () => {
    const view = integrationView(
      integration([assets, workOrders, notifications]),
    );
    expect(view.state).toBe("failing");
    expect(view.errorMessage).toBe(
      "1 of 3 streams failing. 504 Gateway timeout",
    );
  });

  it("takes the next sync only from streams that are running", () => {
    const view = integrationView(
      integration([assets, workOrders, notifications]),
    );
    expect(view.schedule?.nextSyncAt).toEqual(new Date("2026-08-20T10:30:00Z"));
    expect(view.schedule?.every).toEqual([3600, 86_400]);
    expect(view.lastAt).toEqual(new Date("2026-08-20T10:00:00Z"));
  });

  it("lists every stream's records, zero included", () => {
    expect(
      integrationView(integration([assets, workOrders, notifications])).records,
    ).toEqual([
      { resource: ResourceType.Asset, count: 128 },
      { resource: ResourceType.WorkOrder, count: 56 },
      { resource: ResourceType.SourceRecord, count: 0 },
    ]);
  });

  it("adds records of a type with no stream, but only when there are some", () => {
    const item = integration([assets, notifications]);
    expect(integrationView(item).records).toEqual([
      { resource: ResourceType.Asset, count: 128 },
      { resource: ResourceType.SourceRecord, count: 0 },
      { resource: ResourceType.WorkOrder, count: 56 },
    ]);
  });

  it("is paused when every stream is paused", () => {
    const view = integrationView(
      integration([
        { ...assets, enabled: false },
        { ...workOrders, enabled: false },
      ]),
    );
    expect(view.state).toBe("paused");
    expect(view.schedule?.nextSyncAt).toBeNull();
  });

  it("is healthy when a running stream succeeded and none fail", () => {
    const neverRan = sync({
      resource: ResourceType.WorkOrder,
      status: SyncStatusEnum.Pending,
      lastSuccessfulSync: null,
    });
    expect(integrationView(integration([assets, neverRan])).state).toBe(
      "healthy",
    );
    expect(
      integrationView(
        integration([neverRan, { ...neverRan, resource: "Asset" }]),
      ).state,
    ).toBe("unknown");
  });
});

describe("isPaused", () => {
  it("is paused when switched off, or when on with every stream off", () => {
    expect(isPaused(integration([sync()], { enabled: false }))).toBe(true);
    expect(isPaused(integration([sync({ enabled: false })]))).toBe(true);
  });

  it("is running while any stream runs, or when it has no streams yet", () => {
    expect(
      isPaused(
        integration([
          sync({ enabled: false }),
          sync({ resource: ResourceType.WorkOrder }),
        ]),
      ),
    ).toBe(false);
    expect(isPaused(integration([]))).toBe(false);
  });
});

describe("uploads", () => {
  const upload = (
    id: string,
    status: SyncStatusEnum,
    count: number,
  ): IntegrationListItem =>
    integration(
      [
        sync({
          integrationId: id,
          status,
          lastAttemptAt: new Date("2026-08-20T09:00:00Z"),
        }),
      ],
      {
        id,
        platform: PlatformEnum.CSV_UPLOAD,
        recordCounts: {
          Asset: count,
          WorkOrder: 0,
          SourceRecord: 0,
          Vulnerability: 0,
          DeviceArtifact: 0,
          Remediation: 0,
        },
      },
    );

  it("shows an upload that is still running as importing, with no schedule", () => {
    expect(uploadView(upload("u1", SyncStatusEnum.Pending, 0))).toMatchObject({
      state: "importing",
      schedule: null,
      lastAt: new Date("2026-08-20T09:00:00Z"),
    });
  });

  it("gives a platform's uploads the newest upload's status and the summed records", () => {
    const view = uploadGroupView([
      upload("newest", SyncStatusEnum.Error, 3),
      upload("older", SyncStatusEnum.Success, 40),
    ]);
    expect(view.state).toBe("failing");
    expect(view.records).toEqual([{ resource: ResourceType.Asset, count: 43 }]);
  });
});

describe("recordLabel", () => {
  it("pluralizes and groups digits", () => {
    expect(recordLabel({ resource: ResourceType.WorkOrder, count: 1204 })).toBe(
      "1,204 work orders",
    );
    expect(recordLabel({ resource: ResourceType.Asset, count: 1 })).toBe(
      "1 asset",
    );
    expect(recordLabel({ resource: ResourceType.SourceRecord, count: 0 })).toBe(
      "0 notifications",
    );
  });
});
