import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

async function createIssuesForVulnerabilities() {
  try {
    // Retrieve all vulnerabilities and assets
    const vulnerabilities = await prisma.vulnerability.findMany();

    // Build a map of CPE to asset IDs for efficient lookup
    const assets = await prisma.asset.findMany({
      select: { id: true, cpe: true },
    });
    const cpeToAssets = new Map<string, string[]>();
    for (const asset of assets) {
      if (!cpeToAssets.has(asset.cpe)) {
        cpeToAssets.set(asset.cpe, []);
      }
      const assetsArr = cpeToAssets.get(asset.cpe) || [];
      assetsArr.push(asset.id);
      cpeToAssets.set(asset.cpe, assetsArr);
    }

    const issueRecords = [];

    for (const vuln of vulnerabilities) {
      const matchingAssetIds = cpeToAssets.get(vuln.cpe) || [];
      for (const assetId of matchingAssetIds) {
        issueRecords.push({
          assetId,
          vulnerabilityId: vuln.id,
        });
      }
    }

    // Batch upsert to avoid duplicates
    console.log(`Creating ${issueRecords.length} issues...`);
    for (const record of issueRecords) {
      await prisma.issue.upsert({
        where: {
          assetId_vulnerabilityId: {
            assetId: record.assetId,
            vulnerabilityId: record.vulnerabilityId,
          },
        },
        create: record,
        update: {}, // No updates needed, just prevent duplicates
      });
    }

    console.log("Issues created successfully!");
  } catch (error) {
    console.error("Error creating issues:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute the script
createIssuesForVulnerabilities();
