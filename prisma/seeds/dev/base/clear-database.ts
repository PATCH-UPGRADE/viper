import prisma from "@/lib/db";

export async function clearDatabase() {
  console.log("🗑️  Clearing database...");

  // Tickets first — they reference assets/vulns/remediations/advisories/workflows/users.
  // Comments and descriptions cascade with their parent ticket; the implicit
  // m2m join rows cascade too.
  await prisma.ticketComment.deleteMany();
  await prisma.ticketDescription.deleteMany();
  await prisma.workOrderTicket.deleteMany();
  // Workflows cascade to Node and Connection
  await prisma.workflow.deleteMany();
  // Delete in order of dependencies (child tables first)
  await prisma.issue.deleteMany();
  await prisma.integrationResourceSync.deleteMany();
  // Ticket deletion cascades SourceLink but not the records themselves.
  await prisma.sourceRecord.deleteMany({ where: { links: { none: {} } } });
  await prisma.externalAssetMapping.deleteMany();
  await prisma.externalVulnerabilityMapping.deleteMany();
  await prisma.artifact.deleteMany();
  await prisma.artifactWrapper.deleteMany();
  await prisma.contract.deleteMany();
  // Both the contract and vendor deletes are SetNull, so the relationship would
  // otherwise survive here with a null vendorId, out of reach of the
  // vendor-scoped cleanup in seedVendors().
  await prisma.managesRelationship.deleteMany();
  await prisma.vendorContact.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.remediation.deleteMany();
  await prisma.vulnerability.deleteMany();
  await prisma.deviceArtifact.deleteMany();
  await prisma.deviceGroupHistory.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.deviceGroup.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.note.deleteMany();
  await prisma.categoryColor.deleteMany();
  await prisma.department.deleteMany();

  console.log("✅ Database cleared");
}
