import { Prisma, PrismaClient } from "@/generated/prisma";
import { getBaseUrl } from "@/lib/url-utils";

// create issues on vulnerability create
const vulnerabilityExtension = Prisma.defineExtension((client) =>
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
const deviceGroupExtension = Prisma.defineExtension({
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
          return `${getBaseUrl()}/api/v1/deviceGroups/${deviceGroup.id}/deviceArtifacts`;
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

// allows us to extend deviceGroup model wherever it gets used
const createPrismaClient = () =>
  new PrismaClient()
    .$extends(deviceGroupExtension)
    .$extends(vulnerabilityExtension);

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
