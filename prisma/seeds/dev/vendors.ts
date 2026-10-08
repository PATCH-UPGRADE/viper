import prisma from "@/lib/db";
import { SIEMENS_HEALTHINEERS } from "@/lib/manufacturer-catalog";
import { upsertManufacturer } from "./canonical-identity";
import { SEED_USER_DEPARTMENT } from "./departments";

export async function seedVendors() {
  console.log("\n🌱 Seeding vendors...");

  const manufacturer = await upsertManufacturer(
    SIEMENS_HEALTHINEERS.canonicalDisplayName,
  );

  const vendor = await prisma.vendor.upsert({
    where: { canonicalName: SIEMENS_HEALTHINEERS.canonicalName },
    update: { manufacturerId: manufacturer.id },
    create: {
      canonicalName: SIEMENS_HEALTHINEERS.canonicalName,
      canonicalDisplayName: SIEMENS_HEALTHINEERS.canonicalDisplayName,
      overview: "Manages imaging fleet across radiology and cardiology.",
      partnerSince: new Date("2019-04-01"),
      manufacturerId: manufacturer.id,
    },
  });

  // Rebuilt rather than upserted: neither model has a natural unique key, so a
  // re-seed would otherwise stack duplicates every run.
  await prisma.contract.deleteMany({ where: { vendorId: vendor.id } });
  // Contract.managesRelationshipId is SetNull, so the delete above orphans the
  // relationship rather than removing it — clear it explicitly.
  await prisma.managesRelationship.deleteMany({
    where: { vendorId: vendor.id },
  });
  await prisma.vendorContact.deleteMany({ where: { vendorId: vendor.id } });

  await prisma.vendorContact.createMany({
    data: [
      {
        vendorId: vendor.id,
        name: "Dana Whitfield",
        title: "Hospital Biomed Lead",
        email: "dana.whitfield@example-siemens.test",
        phone: "+1-555-0142",
        notes: "Usually responds the fastest.",
      },
      {
        vendorId: vendor.id,
        name: "Marcus Feld",
        title: "Field Service Engineer",
        email: "marcus.feld@example-siemens.test",
      },
    ],
  });

  const assets = await prisma.asset.findMany({
    where: { deviceGroup: { manufacturerId: manufacturer.id } },
    select: { id: true },
  });

  // ContractAsset is gone: a contract reaches its assets through the
  // ManagesRelationship that answers "who is responsible for this asset?".
  const managesRelationship = await prisma.managesRelationship.create({
    data: {
      responsibilities:
        "Managed security and maintenance for imaging equipment under contract.",
      vendorId: vendor.id,
      assets: { connect: assets.map((asset) => ({ id: asset.id })) },
    },
  });

  await prisma.contract.create({
    data: {
      vendorId: vendor.id,
      title: "Imaging Fleet Managed Service Agreement",
      effectiveFrom: new Date("2024-01-01"),
      effectiveTo: new Date("2027-12-31"),
      managesRelationshipId: managesRelationship.id,
    },
  });

  // An in-house owner beside the vendor: no workOrderIntegration, so it is not
  // a filing target, but work orders drafted for these assets go on its team.
  const itDepartment = await prisma.department.findUniqueOrThrow({
    where: { name: SEED_USER_DEPARTMENT },
  });
  await prisma.managesRelationship.deleteMany({
    where: { departmentId: itDepartment.id },
  });
  await prisma.managesRelationship.create({
    data: {
      responsibilities:
        "IT patches and monitors the imaging workstations and their network segment.",
      departmentId: itDepartment.id,
      assets: { connect: assets.map((asset) => ({ id: asset.id })) },
    },
  });

  console.log(
    `✅ Seeded vendor ${vendor.canonicalDisplayName} with 1 contract covering ${assets.length} assets, co-managed by ${itDepartment.name}`,
  );
}
