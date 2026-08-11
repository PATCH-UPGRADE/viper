import { hashPassword } from "better-auth/crypto";
import { type AssetStatus, Severity, VersionStatus } from "@/generated/prisma";
import prisma from "@/lib/db";

const SEED_USER = {
  email: "user@example.com",
  password: "1337_gone_jolene",
  name: "Seed User",
};

const FIXTURE_CVE = "CVE-2099-0371";
const MANUFACTURER = "Metriq Medical";
const PRODUCT = "Infuse Station IQ";
const VERSION = "4.2.0";

const ASSET_SPECS = [
  {
    ip: "10.77.0.11",
    hostname: "rdt-infuse-01",
    serialNumber: "RDT-INFUSE-001",
    role: "Infusion Pump",
    networkSegment: "CLINICAL-INFUSION",
    location: {
      facility: "Main Hospital",
      building: "West Wing",
      floor: "3",
      room: "ICU 1",
    },
  },
  {
    ip: "10.77.0.12",
    hostname: "rdt-infuse-02",
    serialNumber: "RDT-INFUSE-002",
    role: "Infusion Pump",
    networkSegment: "CLINICAL-INFUSION",
    location: {
      facility: "Main Hospital",
      building: "West Wing",
      floor: "3",
      room: "ICU 2",
    },
  },
  {
    ip: "10.77.0.13",
    hostname: "rdt-infuse-03",
    serialNumber: "RDT-INFUSE-003",
    role: "Infusion Pump",
    networkSegment: "CLINICAL-INFUSION",
    location: {
      facility: "Main Hospital",
      building: "East Wing",
      floor: "2",
      room: "Med-Surg 12",
    },
  },
];

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");
  const { hostname } = new URL(raw);
  // "postgres" is the compose service host inside the deployed stack.
  if (!["localhost", "127.0.0.1", "postgres"].includes(hostname)) {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${hostname}". This script deletes metric data and only runs against a local or stack-internal database.`,
    );
  }
}

async function createOrGetSeedUser() {
  const existing = await prisma.user.findUnique({
    where: { email: SEED_USER.email },
  });
  if (existing) return existing;

  const hashedPassword = await hashPassword(SEED_USER.password);
  return prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: SEED_USER.email,
      name: SEED_USER.name,
      emailVerified: true,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: SEED_USER.email,
          providerId: "credential",
          password: hashedPassword,
        },
      },
    },
  });
}

function upsertManufacturer(name: string) {
  const canonicalName = name.trim().toLowerCase();
  return prisma.manufacturer.upsert({
    where: { canonicalName },
    update: {},
    create: { canonicalName, canonicalDisplayName: name, hasCpe: true },
  });
}

function upsertProduct(name: string) {
  const canonicalName = name.trim().toLowerCase();
  return prisma.product.upsert({
    where: { canonicalName },
    update: {},
    create: { canonicalName, canonicalDisplayName: name, hasCpe: true },
  });
}

function upsertVersion(name: string) {
  const canonicalName = name.trim().toLowerCase();
  return prisma.version.upsert({
    where: { canonicalName },
    update: {},
    create: { canonicalName, canonicalDisplayName: name, hasCpe: true },
  });
}

async function teardownFixture() {
  const remediations = await prisma.remediation.findMany({
    where: { vulnerability: { cveId: FIXTURE_CVE } },
    select: { id: true },
  });
  const remediationIds = remediations.map((r) => r.id);

  const sources = await prisma.notificationSource.findMany({
    where: { channel: "TA4", externalId: { in: remediationIds } },
    select: { notificationId: true },
  });
  const notificationIds = sources
    .map((s) => s.notificationId)
    .filter((id): id is string => id !== null);

  const notifications = await prisma.notification.deleteMany({
    where: { id: { in: notificationIds } },
  });
  const deleted = await prisma.remediation.deleteMany({
    where: { id: { in: remediationIds } },
  });
  const vulns = await prisma.vulnerability.deleteMany({
    where: { cveId: FIXTURE_CVE },
  });

  console.log(
    `  teardown: ${notifications.count} notification(s), ${deleted.count} remediation(s), ${vulns.count} vulnerability(s)`,
  );
}

async function seedFixture(userId: string) {
  const manufacturer = await upsertManufacturer(MANUFACTURER);
  const product = await upsertProduct(PRODUCT);
  const version = await upsertVersion(VERSION);

  const matchingIdentity = {
    manufacturerId: manufacturer.id,
    productId: product.id,
    versionId: version.id,
    versionRange: null,
  };
  const matching =
    (await prisma.deviceGroupMatching.findFirst({ where: matchingIdentity })) ??
    (await prisma.deviceGroupMatching.create({ data: matchingIdentity }));

  const groupIdentity = {
    manufacturerId: manufacturer.id,
    productId: product.id,
    versionId: version.id,
    versionStatus: VersionStatus.KNOWN,
  };
  const deviceGroup =
    (await prisma.deviceGroup.findFirst({ where: groupIdentity })) ??
    (await prisma.deviceGroup.create({ data: groupIdentity }));

  for (const spec of ASSET_SPECS) {
    const data = {
      ...spec,
      upstreamApi: "https://example.com/rdt-metric",
      status: "Active" as AssetStatus,
      deviceGroupId: deviceGroup.id,
      userId,
    };
    const existing = await prisma.asset.findFirst({
      where: { serialNumber: spec.serialNumber },
    });
    if (existing) {
      await prisma.asset.update({ where: { id: existing.id }, data });
    } else {
      await prisma.asset.create({ data });
    }
  }

  const vulnerability = await prisma.vulnerability.create({
    data: {
      cveId: FIXTURE_CVE,
      severity: Severity.High,
      cvssScore: 7.5,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N",
      description:
        "Synthetic fixture for the remediation deployment time IV&V metric: improper firmware validation on the Infuse Station IQ allows unsigned firmware to be installed.",
      narrative:
        "An attacker with network access to the pump could push unsigned firmware and alter infusion parameters.",
      impact:
        "Infusion pumps could deliver incorrect dosages until patched, requiring manual verification of every infusion in progress.",
      userId,
      sarif: {
        version: "2.1.0",
        runs: [
          {
            tool: { driver: { name: "RDT Metric Fixture" } },
            results: [
              {
                ruleId: FIXTURE_CVE,
                level: "error",
                message: {
                  text: "Improper firmware validation on Infuse Station IQ 4.2.0",
                },
              },
            ],
          },
        ],
      },
      // Must be inline: the extension opens baseline Issues only for matchings linked in this create.
      deviceGroupMatchings: { connect: { id: matching.id } },
    },
  });

  return { matching, deviceGroup, vulnerability };
}

async function printSummaryAndAssert() {
  const failures: string[] = [];

  const vulnerability = await prisma.vulnerability.findFirst({
    where: { cveId: FIXTURE_CVE },
    include: { deviceGroupMatchings: true, issues: true },
  });
  if (!vulnerability) throw new Error(`${FIXTURE_CVE} missing after seeding.`);

  const matchings = vulnerability.deviceGroupMatchings.length;
  const baseline = vulnerability.issues.filter(
    (issue) => issue.deviceGroupMatchingId !== null,
  ).length;
  const assetLevel = vulnerability.issues.filter(
    (issue) => issue.assetId !== null,
  ).length;
  const assets = await prisma.asset.count({
    where: { serialNumber: { in: ASSET_SPECS.map((s) => s.serialNumber) } },
  });

  console.log(`\n  ${FIXTURE_CVE}`);
  console.log(`    device group matchings  ${matchings}`);
  console.log(`    baseline issues         ${baseline}`);
  console.log(`    asset-level issues      ${assetLevel}`);
  console.log(`    fixture assets          ${assets}`);

  if (matchings !== 1) failures.push(`expected 1 matching, found ${matchings}`);
  if (baseline !== matchings) {
    failures.push(
      `${matchings} matching(s) but ${baseline} baseline issue(s) — matchings must be connected inline in the vulnerability create()`,
    );
  }
  if (assetLevel !== 0) {
    failures.push(
      `${assetLevel} asset-level issue(s) — those are VEX output and must not exist after a fresh seed`,
    );
  }
  if (assets !== ASSET_SPECS.length) {
    failures.push(
      `expected ${ASSET_SPECS.length} fixture assets, found ${assets}`,
    );
  }

  if (failures.length > 0) {
    console.error("\n❌ Fixture is not usable:");
    for (const failure of failures) console.error(`   - ${failure}`);
    throw new Error("Seed produced an unusable fixture.");
  }
  console.log("\n  ✅ invariants hold");

  return vulnerability;
}

async function main() {
  console.log("🚀 Seeding remediation deployment time metric fixture\n");
  assertLocalDatabase();

  const user = await createOrGetSeedUser();
  await teardownFixture();
  await seedFixture(user.id);
  const vulnerability = await printSummaryAndAssert();

  console.log(`\nVULNERABILITY_ID=${vulnerability.id}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
