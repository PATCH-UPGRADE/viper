import { type Prisma, PrismaClient } from "@/generated/prisma";
import {
  deviceGroupExtension,
  sendWebhooksExtension,
  vulnerabilityExtension,
} from "./prisma-client-extensions";

const createPrismaClient = () =>
  new PrismaClient()
    .$extends(deviceGroupExtension)
    .$extends(vulnerabilityExtension)
    .$extends(sendWebhooksExtension);

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

export type FullIssue = Prisma.IssueGetPayload<{
  include: { asset: true; vulnerability: true };
}>;
