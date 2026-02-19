import { type Prisma, PrismaClient } from "@/generated/prisma";
import {
  artifactExtension,
  deviceGroupExtension,
  sendWebhooksExtension,
  vulnerabilityExtension,
} from "./prisma-client-extensions";

const createPrismaClient = () =>
  new PrismaClient()
    .$extends(deviceGroupExtension)
    .$extends(artifactExtension)
    .$extends(vulnerabilityExtension)
    .$extends(sendWebhooksExtension);

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

export type AssetWithIssues = Prisma.AssetGetPayload<{
  include: {
    issues: true;
    deviceGroup: {
      select: {
        id: true;
        cpe: true;
      };
    };
  };
}>;

export type AssetWithDeviceGroup = Prisma.AssetGetPayload<{
  include: {
    deviceGroup: {
      select: {
        id: true;
        cpe: true;
      };
    };
  };
}>;

// TODO: these should eventually get moved to /types.ts
// However, I'm not touching them now becuase I think we're retiring everything these are currently
// being used for (VulnerabilityItem / VulnerabilityDrawer)
export type VulnerabilityWithIssues = Prisma.VulnerabilityGetPayload<{
  include: {
    issues: true;
    affectedDeviceGroups: {
      select: {
        id: true;
        cpe: true;
      };
    };
  };
}>;

export type VulnerabilityWithDeviceGroups = Prisma.VulnerabilityGetPayload<{
  include: {
    affectedDeviceGroups: {
      select: {
        id: true;
        cpe: true;
      };
    };
  };
}>;
