import { type Prisma, PrismaClient } from "@/generated/prisma";
import { createServerSingleton } from "./singleton";

const getPrisma = createServerSingleton("prisma", () => new PrismaClient());

export default getPrisma();

export type AssetWithIssues = Prisma.AssetGetPayload<{
  include: { issues: true };
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
