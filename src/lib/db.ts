import { type Prisma, PrismaClient } from "@/generated/prisma";
import {
  artifactExtension,
  deviceGroupExtension,
  sendWebhooksExtension,
  updateConnectorExtension,
  vulnerabilityExtension,
} from "./prisma-client-extensions";

const createPrismaClient = () =>
  new PrismaClient()
    .$extends(deviceGroupExtension)
    .$extends(artifactExtension)
    .$extends(vulnerabilityExtension)
    .$extends(sendWebhooksExtension)
    .$extends(updateConnectorExtension);

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;
export type TransactionClient = Parameters<
  Parameters<ExtendedPrismaClient["$transaction"]>[0]
>[0];

// see https://www.prisma.io/docs/guides/nextjs#26-set-up-prisma-client
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;

const canonicalRefSelect = {
  select: { canonicalName: true, canonicalDisplayName: true },
} as const;

const deviceGroupSummarySelect = {
  select: {
    id: true,
    vendor: canonicalRefSelect,
    product: canonicalRefSelect,
    version: canonicalRefSelect,
    versionStatus: true,
    cpe: true,
  },
} as const;

export type AssetWithIssues = Prisma.AssetGetPayload<{
  include: {
    issues: true;
    deviceGroup: typeof deviceGroupSummarySelect;
  };
}>;

export type AssetWithDeviceGroup = Prisma.AssetGetPayload<{
  include: {
    deviceGroup: typeof deviceGroupSummarySelect;
  };
}>;

// TODO: these should eventually get moved to /types.ts
// However, I'm not touching them now becuase I think we're retiring everything these are currently
// being used for (VulnerabilityItem / VulnerabilityDrawer)
export type VulnerabilityWithIssues = Prisma.VulnerabilityGetPayload<{
  include: {
    issues: true;
    deviceGroupMatchings: true;
  };
}>;
