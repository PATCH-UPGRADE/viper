import { Prisma, TriggerEnum } from "@/generated/prisma";
import type { PayloadToResult } from "@/generated/prisma/runtime/library";
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

// sends out related webhooks when prisma (creates | updates | upserts | createMany | updateMany) a DeviceGroup or Artifact
export const sendWebhooksExtension = Prisma.defineExtension({
  name: "sendWebhooksOnDatabaseEvent",
  query: {
    deviceGroup: {
      async update({ args, query }) {
        const item = await query(args);
        handleSimpleQuery(TriggerEnum.DeviceGroup_Updated, item.updatedAt);
        return item;
      },
      async updateMany({ args, query }) {
        const items = await query(args);
        // NOTE: Prisma / PSQL updateMany doesn't return a list of records for "updatedAt" so create one here
        sendWebhooks(TriggerEnum.DeviceGroup_Updated, new Date());
        return items;
      },
      async upsert({ args, query }) {
        const item = await query(args);
        handleUpsertQuery(
          TriggerEnum.DeviceGroup_Created,
          TriggerEnum.DeviceGroup_Updated,
          item.createdAt,
          item.updatedAt,
        );
        return item;
      },
      async createMany({ args, query }) {
        const items = await query(args);
        // NOTE: Prisma / PSQL createMany doesn't return a list of records for "createdAt" so create one here
        sendWebhooks(TriggerEnum.DeviceGroup_Created, new Date());
        return items;
      },
      async create({ args, query }) {
        const item = await query(args);
        handleSimpleQuery(TriggerEnum.DeviceGroup_Created, item.createdAt);
        return item;
      },
    },
    artifact: {
      async update({ args, query }) {
        const item = await query(args);
        handleSimpleQuery(TriggerEnum.Artifact_Updated, item.updatedAt);
        return item;
      },
      async updateMany({ args, query }) {
        const items = await query(args);
        // NOTE: Prisma / PSQL updateMany doesn't return a list of records for "updatedAt" so create one here
        sendWebhooks(TriggerEnum.Artifact_Updated, new Date());
        return items;
      },
      async upsert({ args, query }) {
        const item = await query(args);
        handleUpsertQuery(
          TriggerEnum.Artifact_Created,
          TriggerEnum.Artifact_Updated,
          item.createdAt,
          item.updatedAt,
        );
        return item;
      },
      async createMany({ args, query }) {
        const items = await query(args);
        // NOTE: Prisma / PSQL createMany doesn't return a list of records for "createdAt" so create one here
        sendWebhooks(TriggerEnum.Artifact_Created, new Date());
        return items;
      },
      async create({ args, query }) {
        const item = await query(args);
        handleSimpleQuery(TriggerEnum.Artifact_Created, item.createdAt);
        return item;
      },
    },
  },
});
