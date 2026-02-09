import {
  Prisma,
  TriggerEnum,
} from "@/generated/prisma";
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
      emulatorsUrl: {
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
  }),
);

const sendWebhooks = async (triggerType: TriggerEnum, timestamp: Date) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { triggers: { has: triggerType }}
    });
    await Promise.allSettled(
      webhooks.map((webhook) => sendWebhook(triggerType, timestamp, webhook))
    )
  } catch (e: unknown) {
    console.error("Failed to send webhook with error:", e)
  }
};

export const sendWebhooksExtension = Prisma.defineExtension({
  name: "sendWebhooksOnDatabaseEvent",
  query: {
    deviceGroup: {
      async update({ args, query }) {
        const item = await query(args);
        sendWebhooks(
          TriggerEnum.DeviceGroup_Updated,
          !item.updatedAt ? new Date() : (item.updatedAt as Date),
        );
        return item;
      },
      async updateMany({ args, query }) {
        // NOTE: Prisma / PSQL updateMany doesn't return a list of records for "updatedAt" so create one here
        sendWebhooks(TriggerEnum.DeviceGroup_Updated, new Date());
        return await query(args);
      },
      async upsert({ args, query }) {
        const item = await query(args);

        // Need to check if upsert was a create or update by checking timestamps
        let timestamp = new Date();
        let trigger: TriggerEnum = TriggerEnum.DeviceGroup_Updated;

        if (item.createdAt && item.updatedAt) {
          const createdAt = item.createdAt as Date;
          const updatedAt = item.updatedAt as Date;
          timestamp = updatedAt;
          if (createdAt.getTime() === updatedAt.getTime()) {
            trigger = TriggerEnum.DeviceGroup_Created;
          }
        }

        sendWebhooks(trigger, timestamp);
        return item;
      },
      async createMany({ args, query }) {
        // NOTE: Prisma / PSQL createMany doesn't return a list of records for "createdAt" so create one here
        sendWebhooks(TriggerEnum.DeviceGroup_Created, new Date());
        return await query(args);
      },
      async create({ args, query }) {
        const item = await query(args);
        sendWebhooks(
          TriggerEnum.DeviceGroup_Created,
          !item.createdAt ? new Date() : (item.createdAt as Date),
        );
        return item;
      },
    },
  },
});
