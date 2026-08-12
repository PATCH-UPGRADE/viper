// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockTx } = vi.hoisted(() => {
  const tx = {
    integrationResourceSync: { upsert: vi.fn() },
    apiKeyConnector: { updateMany: vi.fn() },
  };
  return {
    mockTx: tx,
    mockPrisma: {
      // biome-ignore lint/suspicious/noExplicitAny: prisma's interactive-transaction signature
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    },
  };
});

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/lib/router-utils", () => ({ createArtifactWrappers: vi.fn() }));

import { ResourceType, SyncStatusEnum } from "@/generated/prisma";
import type { IntegrationResponse } from "@/lib/schemas";
import { upsertResourceSync } from "../ingest";

const SYNCED_AT = new Date("2026-08-12T10:00:00.000Z");

const response = (
  overrides: Partial<IntegrationResponse> = {},
): IntegrationResponse => ({
  message: "success",
  createdItemsCount: 0,
  updatedItemsCount: 0,
  shouldRetry: false,
  syncedAt: SYNCED_AT.toISOString(),
  ...overrides,
});

const call = (res: IntegrationResponse) =>
  upsertResourceSync("integration-1", ResourceType.Asset, res, SYNCED_AT);

const upsertArgs = () => mockTx.integrationResourceSync.upsert.mock.calls[0][0];

beforeEach(() => vi.clearAllMocks());

describe("upsertResourceSync", () => {
  it("records success and resets the failure streak", async () => {
    await call(response());

    expect(upsertArgs().update).toMatchObject({
      status: SyncStatusEnum.Success,
      errorMessage: null,
      lastSuccessfulSync: SYNCED_AT,
      consecutiveFailures: 0,
    });
  });

  it("records failure and bumps the failure streak", async () => {
    await call(response({ shouldRetry: true, message: "1 of 2 items failed" }));

    expect(upsertArgs().update).toMatchObject({
      status: SyncStatusEnum.Error,
      errorMessage: "1 of 2 items failed",
      consecutiveFailures: { increment: 1 },
    });
    expect(upsertArgs().update).not.toHaveProperty("lastSuccessfulSync");
  });

  it("starts the failure streak at 1 when the row is new", async () => {
    await call(response({ shouldRetry: true, message: "boom" }));

    expect(upsertArgs().create).toMatchObject({
      integrationId: "integration-1",
      resource: ResourceType.Asset,
      status: SyncStatusEnum.Error,
      consecutiveFailures: 1,
    });
  });

  it("keys the upsert on (integration, resource)", async () => {
    await call(response());

    expect(upsertArgs().where).toEqual({
      integrationId_resource: {
        integrationId: "integration-1",
        resource: ResourceType.Asset,
      },
    });
  });

  it("stamps the connector's lastRequest in the same transaction", async () => {
    await call(response());

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.apiKeyConnector.updateMany).toHaveBeenCalledWith({
      where: { integrationId: "integration-1" },
      data: { lastRequest: SYNCED_AT },
    });
  });
});
