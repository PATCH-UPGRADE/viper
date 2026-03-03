import { Prisma, TriggerEnum } from "@/generated/prisma";
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
        needs: { id: true },
        compute(deviceGroup) {
          return `TODO. ${deviceGroup.id}`; // VW-54
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

          // get all assets related to this vuln
          const assets = await client.asset.findMany({
            where: {
              deviceGroup: {
                vulnerabilities: {
                  some: { id: vulnerability.id },
                },
              },
            },
            select: { id: true },
          });

          // create issues
          if (assets.length > 0 && vulnerability.id) {
            await client.issue.createMany({
              data: assets.map((asset) => ({
                vulnerabilityId,
                assetId: asset.id,
              })),
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
  async updateMany({ args, query }: { args: any; query: any }) {
    const items = await query(args);
    sendWebhooks(updatedTrigger, new Date());
    return items;
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
  async createMany({ args, query }: { args: any; query: any }) {
    const items = await query(args);
    sendWebhooks(createdTrigger, new Date());
    return items;
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
