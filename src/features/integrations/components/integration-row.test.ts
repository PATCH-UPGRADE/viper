import { describe, expect, it } from "vitest";
import { ResourceType, SyncStatusEnum } from "@/generated/prisma";
import type { IntegrationResourceSyncItem } from "../types";
import { aggregateTiming, timingLine } from "./integration-row";

const resourceSync = (
  overrides: Partial<IntegrationResourceSyncItem> = {},
): IntegrationResourceSyncItem => ({
  integrationId: "integration-1",
  resource: ResourceType.Asset,
  status: SyncStatusEnum.Success,
  errorMessage: null,
  lastAttemptAt: null,
  lastSuccessfulSync: null,
  nextSyncAt: null,
  enabled: true,
  syncEvery: null,
  effectiveSyncEvery: 300,
  isOverridden: false,
  isDue: true,
  ...overrides,
});

describe("integration timing", () => {
  it("shows a never-synced integration as due", () => {
    expect(timingLine(resourceSync())).toEqual({
      text: "Sync due",
      isError: false,
    });
  });

  it("uses the failing resource's attempt time for aggregate errors", () => {
    const failedAt = new Date("2026-08-20T10:00:00Z");
    const recentHealthyAttempt = new Date("2026-08-20T12:00:00Z");

    expect(
      aggregateTiming([
        resourceSync({
          status: SyncStatusEnum.Error,
          lastAttemptAt: failedAt,
        }),
        resourceSync({
          resource: ResourceType.WorkOrder,
          lastAttemptAt: recentHealthyAttempt,
          lastSuccessfulSync: recentHealthyAttempt,
        }),
      ])?.lastAttemptAt,
    ).toEqual(failedAt);
  });
});
