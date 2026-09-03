import { hashPassword } from "better-auth/crypto";
import {
  type AssetStatus,
  ScopeTargetModel,
  Severity,
  VersionStatus,
} from "@/generated/prisma";
import prisma from "@/lib/db";

const SEED_USER = {
  email: "user@example.com",
  password: "1337_gone_jolene",
  name: "Seed User",
};

const FIXTURE_CVE = "CVE-2022-29875";
const ADVISORY_URL =
  "https://www.siemens-healthineers.com/support-documentation/cybersecurity/ssa-220609";
const MANUFACTURER = "Siemens Healthineers";
const PRODUCT = "MAGNETOM NUMARIS X";
const VERSION = "VA31A";

const ASSET_SPECS = [
  {
    ip: "10.60.0.21",
    hostname: "mri-numarisx-01",
    serialNumber: "MAGNETOM-NUMARISX-VA31A-001",
    role: "MRI Scanner Console",
    networkSegment: "IMAGING-MRI",
    location: {
      facility: "Main Hospital",
      building: "Imaging Pavilion",
      floor: "1",
      room: "MRI Suite 1",
    },
  },
  {
    ip: "10.60.0.22",
    hostname: "mri-numarisx-02",
    serialNumber: "MAGNETOM-NUMARISX-VA31A-002",
    role: "MRI Scanner Console",
    networkSegment: "IMAGING-MRI-ISOLATED",
    location: {
      facility: "Main Hospital",
      building: "Imaging Pavilion",
      floor: "1",
      room: "MRI Suite 2",
    },
  },
];

// One scanner is carved out of the advisory by a compensating control, which is specified by a note
// TODO: for this specific example, which is about reachability of ports, we are working on integrating
// TA3 tools into our platform as deterministic tools to get this kind of analysis, instead of requiring
// it be seeded in the first place...
const EXCLUDED_SERIAL = "MAGNETOM-NUMARISX-VA31A-002";
const EXCLUSION_NOTE =
  "mri-numarisx-02 is on the IMAGING-MRI-ISOLATED segment, where ports 32912/tcp and " +
  "32914/tcp are permitted inbound only from the two Siemens service jump hosts, per the " +
  "vendor's 'allow network access for trusted clients only' guidance. Both ports are denied " +
  "from every clinical and general-purpose VLAN at the segment firewall. Verified during the " +
  "2026-Q2 segmentation audit (ticket NET-4471).";

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");
  const { hostname } = new URL(raw);
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

function createAssetNote(userId: string, assetId: string, text: string) {
  return prisma.note.create({
    data: {
      userId,
      text,
      targetModel: ScopeTargetModel.ASSET,
      instanceId: assetId,
    },
  });
}

function fixtureAssetIds() {
  return prisma.asset.findMany({
    where: { serialNumber: { in: ASSET_SPECS.map((s) => s.serialNumber) } },
    select: { id: true },
  });
}

async function teardownFixture() {
  // Note.instanceId is a weak reference with no FK, so notes do not cascade off the
  // asset or the vulnerability. Assets are upserted by serial and keep their ids, so
  // without this a re-seed stacks up duplicate copies of the exclusion note.
  const assetIds = (await fixtureAssetIds()).map((a) => a.id);
  const notes = await prisma.note.deleteMany({
    where: {
      targetModel: ScopeTargetModel.ASSET,
      instanceId: { in: assetIds },
    },
  });

  const remediations = await prisma.remediation.findMany({
    where: { vulnerability: { cveId: FIXTURE_CVE } },
    select: { id: true },
  });
  const remediationIds = remediations.map((r) => r.id);

  const sources = await prisma.sourceRecord.findMany({
    where: { channel: "TA4", externalId: { in: remediationIds } },
    select: { id: true, links: { select: { notificationId: true } } },
  });
  const notificationIds = sources
    .flatMap((s) => s.links.map((l) => l.notificationId))
    .filter((id): id is string => id !== null);

  const notifications = await prisma.notification.deleteMany({
    where: { id: { in: notificationIds } },
  });
  // Remediation.sourceRecord is SetNull and the links above cascade with their
  // notification, so these snapshots would otherwise survive every run.
  const orphanSources = await prisma.sourceRecord.deleteMany({
    where: { id: { in: sources.map((s) => s.id) }, links: { none: {} } },
  });
  const deleted = await prisma.remediation.deleteMany({
    where: { id: { in: remediationIds } },
  });
  const vulns = await prisma.vulnerability.deleteMany({
    where: { cveId: FIXTURE_CVE },
  });

  console.log(
    `  teardown: ${notes.count} note(s), ${notifications.count} notification(s), ${orphanSources.count} source(s), ${deleted.count} remediation(s), ${vulns.count} vulnerability(s)`,
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
      upstreamApi: ADVISORY_URL,
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
      cvssScore: 8.8,
      cvssVector: "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      description:
        "The syngo platform underlying NUMARIS X deserialises untrusted data without sufficient validation (CWE-502), which could result in an arbitrary deserialization. An unauthenticated attacker who can reach ports 32912/tcp or 32914/tcp on the scanner console can execute code on the affected system.",
      narrative:
        "An attacker on a network segment that can reach ports 32912/tcp or 32914/tcp on a MAGNETOM NUMARIS X console sends a crafted serialized payload to the syngo service. Because the payload is deserialized without type restriction, it is instantiated and runs arbitrary code under the syngo platform's privileges — no credentials and no user interaction are required.",
      impact:
        "Code execution on the MRI scanner console. An affected scanner must be taken off the schedule until it is verified and updated, displacing booked MRI exams onto the remaining unit and delaying inpatient imaging; in-progress exam data and patient information held on the console are exposed to the attacker.",
      userId,
      sarif: {
        version: "2.1.0",
        runs: [
          {
            tool: { driver: { name: "Siemens Healthineers PSIRT" } },
            results: [
              {
                ruleId: FIXTURE_CVE,
                level: "error",
                message: {
                  text: "Deserialization of untrusted data in Siemens Healthineers syngo platform (SSA-220609) — MAGNETOM NUMARIS X VA31A",
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

  const excludedAsset = await prisma.asset.findFirstOrThrow({
    where: { serialNumber: EXCLUDED_SERIAL },
  });
  await createAssetNote(userId, excludedAsset.id, EXCLUSION_NOTE);

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
  const assetRecords = await prisma.asset.findMany({
    where: { serialNumber: { in: ASSET_SPECS.map((s) => s.serialNumber) } },
    select: { id: true, serialNumber: true },
  });
  const assets = assetRecords.length;

  const notes = await prisma.note.findMany({
    where: {
      targetModel: ScopeTargetModel.ASSET,
      instanceId: { in: assetRecords.map((a) => a.id) },
      deletedAt: null,
    },
    select: { instanceId: true },
  });

  console.log(`\n  ${FIXTURE_CVE}`);
  console.log(`    device group matchings  ${matchings}`);
  console.log(`    baseline issues         ${baseline}`);
  console.log(`    asset-level issues      ${assetLevel}`);
  console.log(`    fixture assets          ${assets}`);
  console.log(`    asset notes             ${notes.length}`);

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

  // A duplicate or a misplaced note would have VEX except the wrong scanner.
  const excludedId = assetRecords.find(
    (a) => a.serialNumber === EXCLUDED_SERIAL,
  )?.id;
  if (notes.length !== 1) {
    failures.push(
      `expected exactly 1 asset-scoped note, found ${notes.length} — VEX must see one unambiguous exception`,
    );
  } else if (notes[0].instanceId !== excludedId) {
    failures.push(
      `the asset note is not on ${EXCLUDED_SERIAL} — VEX would except the wrong scanner`,
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
