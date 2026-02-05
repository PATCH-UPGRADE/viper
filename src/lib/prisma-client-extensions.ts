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
    return { key: "Authorization", value: `Basic ${token}` };
  } else if (itemWithAuth.authType === AuthType.Bearer) {
    const parsed = bearerAuthSchema.safeParse(itemWithAuth.authentication);
    if (!parsed.success) {
      throw new Error("Invalid Bearer auth configuration");
    }
    const { token } = parsed.data;
    return { key: "Authorization", value: `Bearer ${token}` };
  } else if (itemWithAuth.authType === AuthType.Header) {
    const parsed = headerAuthSchema.safeParse(itemWithAuth.authentication);
    if (!parsed.success) {
      throw new Error("Invalid Header auth configuration");
    }
    const { header, value } = parsed.data;
    return { key: header, value };
  }

  throw new Error("Invalid auth configuration");
};

const sendWebhooks = async (triggerType: TriggerEnum, timestamp: Date) => {
  const webhooks = await prisma.webhook.findMany();
  for (const webhook of webhooks) {
    if (webhook.authType === AuthType.None) {
      continue;
    }

    for (const trigger of webhook.triggers) {
      if (trigger === triggerType) {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const { key, value } = parseAuthHeader(webhook);
        headers[key] = value;

        await fetch(webhook.callbackUrl, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            event: triggerType.toString(),
            timestamp: timestamp.toISOString(),
          }),
        });

        break;
      }
    }
  }
};

export const sendWebhooksExtension = Prisma.defineExtension({
  name: "sendWebhooksOnDatabaseEvent",
  query: {
    deviceGroup: {
      async update({ args, query }) {
        const item = await query(args);
        console.log("updatedAt", item.updatedAt);
        sendWebhooks(
          TriggerEnum.DeviceGroup_Updated,
          args.data.updatedAt as Date,
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
        console.log("upsert middleware", item);
        let type: TriggerEnum = TriggerEnum.DeviceGroup_Created;
        if (
          item.createdAt &&
          item.updatedAt &&
          item.createdAt.getTime() === item.updatedAt.getTime()
        ) {
          type = TriggerEnum.DeviceGroup_Updated;
        }
        sendWebhooks(type, item.createdAt as Date);
        return item;
      },
      async createMany({ args, query }) {
        // NOTE: Prisma / PSQL createMany doesn't return a list of records for "createdAt" so create one here
        sendWebhooks(TriggerEnum.DeviceGroup_Created, new Date());
        return await query(args);
      },
      async create({ args, query }) {
        const item = await query(args);
        sendWebhooks(TriggerEnum.DeviceGroup_Created, item.createdAt as Date);
        return item;
      },
    },
  },
});
