import {
  attachMappingUrls,
  type IntegrationUrlContext,
  mappingPaths,
} from "@/features/integrations/core/mapping-urls";
import { moduleForResource } from "@/features/integrations/core/sync/resources";
import {
  type PlatformEnum,
  Prisma,
  type ResourceType,
  TriggerEnum,
} from "@/generated/prisma";
import type { PayloadToResult } from "@/generated/prisma/runtime/library";
import { inngest } from "@/inngest/client";
import prisma from "./db";
import { getBaseUrl } from "./url-utils";
import { sendWebhook } from "./utils";

// add more helper urls for device group
export const deviceGroupExtension = Prisma.defineExtension({
  name: "deviceGroupUrls",
  result: {
    deviceGroup: {
      url: {
        needs: { id: true },
        compute(deviceGroup) {
          return `${getBaseUrl()}/api/v1/deviceGroups/${deviceGroup.id}`;
        },
      },
      sbomUrl: {
        needs: { id: true, helmSbomId: true },
        compute(deviceGroup) {
          if (!deviceGroup.helmSbomId) {
            return null;
          }
          return `${getBaseUrl()}/api/v1/deviceGroups/${deviceGroup.helmSbomId}/sbom`;
        },
      },
      vulnerabilitiesUrl: {
        needs: { id: true },
        compute(deviceGroup) {
          return `${getBaseUrl()}/api/v1/deviceGroups/${deviceGroup.id}/vulnerabilities`;
        },
      },
      deviceArtifactsUrl: {
        needs: { id: true },
        compute(deviceGroup) {
          return `${getBaseUrl()}/api/v1/deviceGroups/${deviceGroup.id}/emulators`;
        },
      },
      assetsUrl: {
        needs: { id: true },
        compute(deviceGroup) {
          return `${getBaseUrl()}/api/v1/deviceGroups/${deviceGroup.id}/assets`;
        },
      },
    },
  },
});

// add more helper urls for artifacts
export const artifactExtension = Prisma.defineExtension({
  name: "artifactUrls",
  result: {
    artifactWrapper: {
      allVersionsUrl: {
        needs: { id: true },
        compute(artifactWrapper) {
          return `${getBaseUrl()}/api/v1/artifacts/versions/${artifactWrapper.id}`;
        },
      },
    },
    artifact: {
      url: {
        needs: { id: true },
        compute(artifact) {
          return `${getBaseUrl()}/api/v1/artifacts/${artifact.id}`;
        },
      },
    },
  },
});

// create issues on vulnerability create
export const vulnerabilityExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: "vulnerabilityIssueCreation",
    query: {
      vulnerability: {
        async create({ query, args }) {
          const vulnerability = await query(args);
          // cast id to string. we know a string exists since create succeeded
          const vulnerabilityId = vulnerability.id as string;

          // Open one baseline issue per DeviceGroupMatching linked to this
          // vulnerability, regardless of whether any assets exist yet.
          const matchings = await client.deviceGroupMatching.findMany({
            where: { vulnerabilities: { some: { id: vulnerabilityId } } },
            select: { id: true },
          });

          if (matchings.length > 0) {
            await client.issue.createMany({
              data: matchings.map((matching) => ({
                vulnerabilityId,
                deviceGroupMatchingId: matching.id,
              })),
              skipDuplicates: true,
            });
          }

          inngest
            .send({
              name: "vulnerability/enrich.requested",
              data: { vulnerabilityId },
            })
            .catch((err) => {
              console.error(
                "Failed to dispatch vulnerability enrichment event:",
                err,
              );
            });

          return vulnerability;
        },
      },
    },
    result: {
      vulnerability: {
        url: {
          needs: { id: true },
          compute(vulnerability) {
            return `${getBaseUrl()}/api/v1/vulnerabilities/${vulnerability.id}`;
          },
        },
      },
    },
  }),
);

const sendWebhooks = async (triggerType: TriggerEnum, timestamp: Date) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { triggers: { has: triggerType } },
    });
    await Promise.allSettled(
      webhooks.map((webhook) => sendWebhook(triggerType, timestamp, webhook)),
    );
  } catch (e: unknown) {
    console.error("Failed to send webhook with error:", e);
  }
};

const handleSimpleQuery = (
  triggerType: TriggerEnum,
  time: PayloadToResult<Date> | undefined,
) => {
  sendWebhooks(triggerType, !time ? new Date() : (time as Date));
};

const handleUpsertQuery = (
  createdTrigger: TriggerEnum,
  updatedTrigger: TriggerEnum,
  createdAt: PayloadToResult<Date> | undefined,
  updatedAt: PayloadToResult<Date> | undefined,
) => {
  // Need to check if upsert was a create or update by checking timestamps
  let timestamp = new Date();
  let trigger: TriggerEnum = updatedTrigger;

  if (createdAt && updatedAt) {
    const created = createdAt as Date;
    const updated = updatedAt as Date;
    timestamp = updated;
    if (created.getTime() === updated.getTime()) {
      trigger = createdTrigger;
    }
  }

  sendWebhooks(trigger, timestamp);
};

const createWebhookHandlers = (
  createdTrigger: TriggerEnum,
  updatedTrigger: TriggerEnum,
) => ({
  // biome-ignore lint/suspicious/noExplicitAny: Prisma query/args types vary per model but the webhook logic is identical
  async update({ args, query }: { args: any; query: any }) {
    const item = await query(args);
    handleSimpleQuery(updatedTrigger, item.updatedAt);
    return item;
  },
  // biome-ignore lint/suspicious/noExplicitAny: Prisma query/args types vary per model but the webhook logic is identical
  async upsert({ args, query }: { args: any; query: any }) {
    const item = await query(args);
    handleUpsertQuery(
      createdTrigger,
      updatedTrigger,
      item.createdAt,
      item.updatedAt,
    );
    return item;
  },
  // biome-ignore lint/suspicious/noExplicitAny: Prisma query/args types vary per model but the webhook logic is identical
  async create({ args, query }: { args: any; query: any }) {
    const item = await query(args);
    handleSimpleQuery(createdTrigger, item.createdAt);
    return item;
  },
});

export const sendWebhooksExtension = Prisma.defineExtension({
  name: "sendWebhooksOnDatabaseEvent",
  query: {
    artifact: createWebhookHandlers(
      TriggerEnum.Artifact_Created,
      TriggerEnum.Artifact_Updated,
    ),
    deviceArtifact: createWebhookHandlers(
      TriggerEnum.DeviceArtifact_Created,
      TriggerEnum.DeviceArtifact_Updated,
    ),
    deviceGroup: createWebhookHandlers(
      TriggerEnum.DeviceGroup_Created,
      TriggerEnum.DeviceGroup_Updated,
    ),
    remediation: createWebhookHandlers(
      TriggerEnum.Remediation_Created,
      TriggerEnum.Remediation_Updated,
    ),
    vulnerability: createWebhookHandlers(
      TriggerEnum.Vulnerability_Created,
      TriggerEnum.Vulnerability_Updated,
    ),
  },
});

// detects apiKey.lastRequest updates and then updates connector.lastRequest
export const updateConnectorExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: "updateApiKeyConnectorLastRequest",
    query: {
      apikey: {
        async update({ args, query }) {
          const result = await query(args);

          // only if lastRequest is part of the api key update
          const lastRequest = args.data?.lastRequest;
          if (lastRequest) {
            await client.apiKeyConnector
              .update({
                where: { apiKeyId: result.id },
                data: { lastRequest },
              })
              .catch((error) => {
                console.error(
                  "updateConnectorExtension failed to update Api Key Connector",
                  error.message,
                );
              });
          }

          return result;
        },
      },
    },
  }),
);

const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/**
 * Platform config for every integration, cached because the row count is tiny
 * and the alternative is a lookup on each qualifying query — including the ones
 * issued from inside an interactive `$transaction`, where a second connection
 * would be taken while the transaction still holds the first.
 */
const INTEGRATION_CACHE_TTL_MS = 30_000;
let integrationCache: {
  loadedAt: number;
  contexts: Map<string, IntegrationUrlContext>;
} | null = null;

let inFlight: Promise<Map<string, IntegrationUrlContext>> | null = null;

export const invalidateIntegrationUrlCache = () => {
  integrationCache = null;
};

type Registry = Awaited<
  typeof import("@/features/integrations/core/registry")
>["registry"];

/** Latched after the first failure so the warning is printed once, not per row. */
let registryUnavailable = false;

/**
 * Fills each `External*Mapping`'s `upstreamApi` / `webUrl` from the platform
 * module that owns the record, falling back to whatever the sync stored.
 *
 * Hooks every model rather than just the six that own mappings, because these
 * are usually reached through a nested include (`issue -> asset ->
 * externalMappings`) and a query extension only fires on the top-level model.
 * `mappingPaths` reads the query's own `select` / `include` tree to decide
 * whether there is anything to do, so every other query is untouched.
 */

export const mappingUrlExtension = Prisma.defineExtension((client) => {
  const loadIntegrations = async () => {
    if (
      integrationCache &&
      Date.now() - integrationCache.loadedAt < INTEGRATION_CACHE_TTL_MS
    ) {
      return integrationCache.contexts;
    }
    // Held as the in-flight promise, so queries arriving on a cold cache share
    // one lookup instead of each issuing their own.
    if (inFlight) return inFlight;

    inFlight = (async () => {
      // Every row, not just the ids asked for: the table is small and one
      // shared snapshot serves every query in the window.
      const rows = await client.integration.findMany({
        select: { id: true, platform: true, config: true },
      });
      const contexts = new Map<string, IntegrationUrlContext>(
        rows.map((row) => [
          row.id,
          { platform: row.platform, config: row.config },
        ]),
      );
      integrationCache = { loadedAt: Date.now(), contexts };
      return contexts;
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };

  const resolveBuilders = async (
    platform: PlatformEnum,
    resource: ResourceType,
  ) => {
    if (registryUnavailable) return undefined;

    let registry: Registry;
    try {
      // Lazy on purpose: registry -> platform modules -> @/lib/db -> this file.
      ({ registry } = await import("@/features/integrations/core/registry"));
    } catch (error) {
      // The registry is `server-only`, so a plain Node context (seed scripts,
      // one-off tooling) cannot load it. Derivation is skipped there rather
      // than taking down every query that selects a mapping; whatever the sync
      // stored still renders.
      registryUnavailable = true;
      console.warn(
        "externalMappingUrls: platform registry unavailable, falling back to stored urls",
        error,
      );
      return undefined;
    }

    const platformModule = registry[platform];
    return platformModule
      ? moduleForResource(platformModule, resource)
      : undefined;
  };

  return client.$extends({
    name: "externalMappingUrls",
    query: {
      // Deliberately only `$allModels`: a model-specific handler in the same
      // extension would take precedence over this one, and `Integration` owns
      // mapping relations of its own.
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);

          if (model === "Integration" && WRITE_OPERATIONS.has(operation)) {
            invalidateIntegrationUrlCache();
          }

          const paths = mappingPaths(model, args);
          if (paths.length === 0) return result;

          await attachMappingUrls(
            result,
            paths,
            loadIntegrations,
            resolveBuilders,
          );
          return result;
        },
      },
    },
  });
});
