import {
  basicAuthSchema,
  bearerAuthSchema,
  headerAuthSchema,
} from "@/features/integrations/types";
import {
  AuthType,
  type Integration,
  Prisma,
  TriggerEnum,
  type Webhook,
} from "@/generated/prisma";
import prisma from "./db";
import { getBaseUrl } from "./url-utils";

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

// TODO: Make this DRY and accept union type IntegrationWithStringDates
const parseAuthHeader = (itemWithAuth: Integration | Webhook) => {
  if (itemWithAuth.authType === AuthType.Basic) {
    // TODO: authentication needs to be encrypted/protected somehow
    const parsed = basicAuthSchema.safeParse(itemWithAuth.authentication);
    if (!parsed.success) {
      throw new Error("Invalid Basic auth configuration");
    }
    const { username, password } = parsed.data;
    const token = Buffer.from(`${username}:${password}`).toString("base64");
    return { header: "Authorization", value: `Basic ${token}` };
  } else if (itemWithAuth.authType === AuthType.Bearer) {
    const parsed = bearerAuthSchema.safeParse(itemWithAuth.authentication);
    if (!parsed.success) {
      throw new Error("Invalid Bearer auth configuration");
    }
    return { header: "Authorization", value: `Bearer ${parsed.data.token}` };
  } else if (itemWithAuth.authType === AuthType.Header) {
    const parsed = headerAuthSchema.safeParse(itemWithAuth.authentication);
    if (!parsed.success) {
      throw new Error("Invalid Header auth configuration");
    }
    const { header, value } = parsed.data;
    return { header, value };
  }

  throw new Error("Invalid auth configuration");
};

export const sendWebhook = async (
  triggerType: TriggerEnum,
  timestamp: Date,
  webhook: Webhook,
) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (webhook.authType !== AuthType.None) {
    const { header, value } = parseAuthHeader(webhook);
    headers[header] = value;
  }

  return await fetch(webhook.callbackUrl, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      webhookTrigger: triggerType.toString(),
      timestamp: timestamp.toISOString(),
    }),
  });
};

const processAndSendWebhooks = async (
  triggerType: TriggerEnum,
  timestamp: Date,
) => {
  const webhooks = await prisma.webhook.findMany();
  for (const webhook of webhooks) {
    let match = false;
    for (const trigger of webhook.triggers) {
      if (trigger === triggerType) {
        match = true;
        break;
      }
    }

    if (!match) {
      continue;
    }

    sendWebhook(triggerType, timestamp, webhook);
  }
};

export const sendWebhooksExtension = Prisma.defineExtension({
  name: "sendWebhooksOnDatabaseEvent",
  query: {
    deviceGroup: {
      async update({ args, query }) {
        const item = await query(args);
        processAndSendWebhooks(
          TriggerEnum.DeviceGroup_Updated,
          !item.updatedAt ? new Date() : (item.updatedAt as Date),
        );
        return item;
      },
      async updateMany({ args, query }) {
        console.log("deviceGroup.updateMany", new Date());
        // NOTE: Prisma / PSQL updateMany doesn't return a list of records for "updatedAt" so create one here
        processAndSendWebhooks(TriggerEnum.DeviceGroup_Updated, new Date());
        return await query(args);
      },
      async upsert({ args, query }) {
        const item = await query(args);
        console.log("deviceGroup.upsert", item.updatedAt);
        const createdAt = !item.createdAt
          ? new Date()
          : (item.createdAt as Date);
        const updatedAt = !item.updatedAt
          ? new Date()
          : (item.updatedAt as Date);
        const trigger =
          createdAt.getTime() === updatedAt.getTime()
            ? TriggerEnum.DeviceGroup_Created
            : TriggerEnum.DeviceGroup_Updated;
        processAndSendWebhooks(trigger, updatedAt);
        return item;
      },
      async createMany({ args, query }) {
        console.log("deviceGroup.createMany", new Date());
        // NOTE: Prisma / PSQL createMany doesn't return a list of records for "createdAt" so create one here
        processAndSendWebhooks(TriggerEnum.DeviceGroup_Created, new Date());
        return await query(args);
      },
      async create({ args, query }) {
        const item = await query(args);
        processAndSendWebhooks(
          TriggerEnum.DeviceGroup_Created,
          !item.createdAt ? new Date() : (item.createdAt as Date),
        );
        return item;
      },
    },
  },
});
