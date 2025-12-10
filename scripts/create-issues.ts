import { PrismaClient } from "@/generated/prisma";
const prisma = new PrismaClient();

async function createIssuesForVulnerabilities() {
  try {
    // Retrieve all vulnerabilities and assets
    const vulnerabilities = await prisma.vulnerability.findMany();
    const assets = await prisma.asset.findMany();

    for (const vuln of vulnerabilities) {
      const cpe = vuln.cpe;

      // Find matching assets based on cpe
      const matchingAssets = assets.filter((asset) => asset.cpe === cpe);

      for (const asset of matchingAssets) {
        // Create a new issue linking the asset and vulnerability
        await prisma.issue.create({
          data: {
            assetId: asset.id,
            vulnerabilityId: vuln.id,
          },
        });
      }
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
