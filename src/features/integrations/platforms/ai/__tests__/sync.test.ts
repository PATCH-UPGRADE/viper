// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const ok = {
    message: "ok",
    createdItemsCount: 1,
    updatedItemsCount: 0,
    shouldRetry: false,
    syncedAt: "2026-09-29T00:00:00.000Z",
  };
  return {
    ok,
    runAiCrawler: vi.fn(),
    mappings: {
      externalAssetMapping: vi.fn(),
      externalVulnerabilityRecordMapping: vi.fn(),
      externalRemediationMapping: vi.fn(),
      externalDeviceArtifactMapping: vi.fn(),
    },
    asset: vi.fn(async () => ok),
    vulnerability: vi.fn(async () => ok),
    remediation: vi.fn(async () => ok),
    deviceArtifact: vi.fn(async () => ok),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  default: Object.fromEntries(
    Object.entries(mocks.mappings).map(([model, findMany]) => [
      model,
      { findMany },
    ]),
  ),
}));
vi.mock("../agent", () => ({ runAiCrawler: mocks.runAiCrawler }));
vi.mock("@/features/assets/server/integration-sync", () => ({
  processAssetIntegrationSync: mocks.asset,
}));
vi.mock("@/features/vulnerabilities/server/integration-sync", () => ({
  processVulnerabilityIntegrationSync: mocks.vulnerability,
}));
vi.mock("@/features/remediations/server/integration-sync", () => ({
  processRemediationIntegrationSync: mocks.remediation,
}));
vi.mock("@/features/device-artifacts/server/integration-sync", () => ({
  processDeviceArtifactIntegrationSync: mocks.deviceArtifact,
}));

import { AuthType, ResourceType } from "@/generated/prisma";
import type { SyncCtx } from "../../../core/types";
import type { AiConfig, AiCreds } from "../config";
import { aiSync } from "../sync";

const CREDS: AiCreds = {
  authType: AuthType.Bearer,
  authentication: { token: "s3cret" },
};

const makeCtx = (resource: ResourceType): SyncCtx<AiConfig, AiCreds> => ({
  integrationId: "int-1",
  integrationUserId: "shadow-1",
  config: {
    integrationUri: "https://vendor.example.com/api/items",
    // SourceRecord is not a valid config resource. aiSync reads ctx.resource.
    resource: resource as AiConfig["resource"],
    additionalInstructions: "Only items from 2026.",
  },
  creds: CREDS,
  resource,
  cursor: "cursor-1",
  lastSuccessfulSync: null,
  callback: async () => {
    throw new Error("the AI crawler does not use the callback");
  },
});

const ITEMS = [{ externalId: "v-1" }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runAiCrawler.mockResolvedValue({ items: ITEMS });
  for (const findMany of Object.values(mocks.mappings)) {
    findMany.mockResolvedValue([]);
  }
});

describe("aiSync", () => {
  // Vulnerability is covered below: its ingest also gets the AI source.
  it.each([
    [ResourceType.Asset, mocks.asset],
    [ResourceType.Remediation, mocks.remediation],
    [ResourceType.DeviceArtifact, mocks.deviceArtifact],
  ])(
    "upserts crawled %s items as the shadow user",
    async (resource, ingest) => {
      const outcome = await aiSync(makeCtx(resource));

      expect(mocks.runAiCrawler).toHaveBeenCalledWith({
        resource,
        integrationUri: "https://vendor.example.com/api/items",
        additionalInstructions: "Only items from 2026.",
        creds: CREDS,
        knownExternalIds: [],
      });
      // finalize-sync records the attempt, so the helper must not record it too.
      expect(ingest).toHaveBeenCalledWith(
        { items: ITEMS },
        "shadow-1",
        "int-1",
        {
          shouldRecordSyncOutcome: false,
        },
      );
      expect(outcome).toEqual({ cursor: "cursor-1" });
    },
  );

  it("records crawled vulnerabilities with the AI source", async () => {
    await aiSync(makeCtx(ResourceType.Vulnerability));

    expect(mocks.vulnerability).toHaveBeenCalledWith(
      { items: ITEMS },
      "shadow-1",
      "int-1",
      { shouldRecordSyncOutcome: false, source: "AI" },
    );
  });

  it("saves a partial crawl, then throws its reason so the sync is not Success", async () => {
    mocks.runAiCrawler.mockResolvedValueOnce({
      items: ITEMS,
      incomplete: "The AI crawler reached its step limit.",
    });

    await expect(aiSync(makeCtx(ResourceType.Asset))).rejects.toThrow(
      "The AI crawler reached its step limit.",
    );
    expect(mocks.asset).toHaveBeenCalledWith(
      { items: ITEMS },
      "shadow-1",
      "int-1",
      { shouldRecordSyncOutcome: false },
    );
  });

  it("reports both a partial crawl and failed items", async () => {
    mocks.runAiCrawler.mockResolvedValueOnce({
      items: ITEMS,
      incomplete: "The AI crawler failed: overloaded.",
    });
    mocks.asset.mockResolvedValueOnce({
      ...mocks.ok,
      shouldRetry: true,
      message: "1 of 1 items failed: bad cpe",
    });

    await expect(aiSync(makeCtx(ResourceType.Asset))).rejects.toThrow(
      "The AI crawler failed: overloaded. 1 of 1 items failed: bad cpe",
    );
  });

  it("throws when an item failed, so finalize-sync records Error", async () => {
    mocks.asset.mockResolvedValueOnce({
      ...mocks.ok,
      shouldRetry: true,
      message: "1 of 1 items failed: bad cpe",
    });

    await expect(aiSync(makeCtx(ResourceType.Asset))).rejects.toThrow(
      "1 of 1 items failed: bad cpe",
    );
  });

  it.each([ResourceType.WorkOrder, ResourceType.SourceRecord])(
    "refuses %s before it crawls",
    async (resource) => {
      await expect(aiSync(makeCtx(resource))).rejects.toThrow(
        `The AI crawler cannot sync ${resource}`,
      );
      expect(mocks.runAiCrawler).not.toHaveBeenCalled();
    },
  );

  it.each([
    [ResourceType.Asset, "externalAssetMapping"],
    [ResourceType.Vulnerability, "externalVulnerabilityRecordMapping"],
    [ResourceType.Remediation, "externalRemediationMapping"],
    [ResourceType.DeviceArtifact, "externalDeviceArtifactMapping"],
  ] as const)(
    "gives the crawler recent %s externalIds from its own mapping table",
    async (resource, model) => {
      mocks.mappings[model].mockResolvedValueOnce([
        { externalId: "dg_1:fuzzer:CWE-798:0" },
      ]);

      await aiSync(makeCtx(resource));

      expect(mocks.mappings[model]).toHaveBeenCalledWith(
        expect.objectContaining({ where: { integrationId: "int-1" } }),
      );
      expect(mocks.runAiCrawler).toHaveBeenCalledWith(
        expect.objectContaining({
          knownExternalIds: ["dg_1:fuzzer:CWE-798:0"],
        }),
      );
    },
  );
});
