import {
  type AssetStatus,
  ScopeTargetModel,
  Severity,
  VersionStatus,
} from "@/generated/prisma";
import prisma from "../src/lib/db";

const SEED_USER_EMAIL = "user@example.com";

const SYNGO_PLAZA_CVE = "CVE-2024-52334";
const DESERIALIZATION_CVE = "CVE-2022-29875";
const ADVISORY_CVES = [SYNGO_PLAZA_CVE, DESERIALIZATION_CVE];

const VENDOR = "Siemens Healthineers";

type AssetSpec = {
  ip: string;
  hostname: string;
  serialNumber: string;
  role: string;
  networkSegment: string;
  location: { facility: string; building: string; floor: string; room: string };
};

// Duplicated from scripts/seed-notifications.ts rather than imported: that module
// calls main() at import time, so importing anything from it would run the other seed.
function upsertVendor(name: string) {
  const canonicalName = name.trim().toLowerCase();
  return prisma.vendor.upsert({
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

async function upsertMatching(spec: {
  product: string;
  version?: string;
  versionRange?: string;
}) {
  const vendor = await upsertVendor(VENDOR);
  const product = await upsertProduct(spec.product);
  const version = spec.version ? await upsertVersion(spec.version) : null;

  const identity = {
    vendorId: vendor.id,
    productId: product.id,
    versionId: version?.id ?? null,
    versionRange: spec.versionRange ?? null,
  };

  return (
    (await prisma.deviceGroupMatching.findFirst({ where: identity })) ??
    (await prisma.deviceGroupMatching.create({ data: identity }))
  );
}

async function upsertDeviceGroup(
  product: string,
  version: string | null,
  versionStatus: VersionStatus = version
    ? VersionStatus.KNOWN
    : VersionStatus.UNKNOWN,
) {
  const vendor = await upsertVendor(VENDOR);
  const productRec = await upsertProduct(product);
  const versionRec = version ? await upsertVersion(version) : null;

  const identity = {
    vendorId: vendor.id,
    productId: productRec.id,
    versionId: versionRec?.id ?? null,
    versionStatus,
  };

  return (
    (await prisma.deviceGroup.findFirst({ where: identity })) ??
    (await prisma.deviceGroup.create({ data: identity }))
  );
}

async function upsertAsset(
  spec: AssetSpec,
  deviceGroupId: string,
  userId: string,
) {
  const existing = await prisma.asset.findFirst({
    where: { serialNumber: spec.serialNumber },
  });
  if (existing) return existing;

  return prisma.asset.create({
    data: {
      ...spec,
      upstreamApi: "https://example.com/placeholder",
      status: "Active" as AssetStatus,
      deviceGroupId,
      userId,
    },
  });
}

async function upsertAssetNote(userId: string, assetId: string, text: string) {
  const existing = await prisma.note.findFirst({
    where: { targetModel: ScopeTargetModel.ASSET, instanceId: assetId },
  });
  if (existing) return existing;

  return prisma.note.create({
    data: {
      userId,
      text,
      targetModel: ScopeTargetModel.ASSET,
      instanceId: assetId,
    },
  });
}

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");
  const { hostname } = new URL(raw);
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${hostname}". This script deletes all notifications and only runs against a local database.`,
    );
  }
}

async function getSeedUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: SEED_USER_EMAIL } });
}

// Deleting the two vulnerabilities is what clears their Issues (Issue.vulnerabilityId
// is onDelete: Cascade). Without it, a previous run's VEX determinations survive and
// the next run measures them instead of its own.
async function resetInboxEnvironment() {
  const notifications = await prisma.notification.deleteMany({});
  const orphanSources = await prisma.notificationSource.deleteMany({
    where: { notificationId: null, workOrderTicketId: null },
  });
  const draftTickets = await prisma.workOrderTicket.deleteMany({
    where: { isDraft: true },
  });
  const vulnerabilities = await prisma.vulnerability.deleteMany({
    where: { cveId: { in: ADVISORY_CVES } },
  });

  console.log(
    `  🧹 removed ${notifications.count} notification(s), ${orphanSources.count} orphan source(s), ${draftTickets.count} draft ticket(s), ${vulnerabilities.count} vulnerability(ies)`,
  );
}

const SYNGO_PLAZA_PRODUCT = "syngo.plaza";
const SYNGO_PLAZA_VERSION = "VB30E";

const SYNGO_PLAZA_ASSETS: AssetSpec[] = [
  {
    ip: "10.50.0.11",
    hostname: "pacs-syngo-01",
    serialNumber: "SYNGO-PLZ-VB30E-001",
    role: "PACS Workstation",
    networkSegment: "RADIOLOGY-PACS",
    location: {
      facility: "Main Hospital",
      building: "Diagnostic Pavilion",
      floor: "2",
      room: "Reading Room A",
    },
  },
  {
    ip: "10.50.0.12",
    hostname: "pacs-syngo-02",
    serialNumber: "SYNGO-PLZ-VB30E-002",
    role: "PACS Workstation",
    networkSegment: "RADIOLOGY-PACS",
    location: {
      facility: "Main Hospital",
      building: "Diagnostic Pavilion",
      floor: "2",
      room: "Reading Room B",
    },
  },
  {
    ip: "10.50.0.13",
    hostname: "pacs-syngo-03",
    serialNumber: "SYNGO-PLZ-VB30E-003",
    role: "PACS Workstation",
    networkSegment: "RADIOLOGY-PACS",
    location: {
      facility: "Main Hospital",
      building: "Diagnostic Pavilion",
      floor: "2",
      room: "Mammography Reading",
    },
  },
];

const SYNGO_PLAZA_EXCEPTION_NOTE =
  "pacs-syngo-03 was updated to VB30E_HF07 during the 2026-02 maintenance window by the Siemens field engineer (service ticket CS-88214). The CMDB record still reads VB30E because the inventory sync has not re-scanned this host; the installed build on disk is VB30E_HF07.";

async function seedSyngoPlazaEnvironment(userId: string) {
  console.log("\n🌱 syngo.plaza VB30E environment (SSA-016040)...");

  const matching = await upsertMatching({
    product: SYNGO_PLAZA_PRODUCT,
    version: SYNGO_PLAZA_VERSION,
  });

  const deviceGroup = await upsertDeviceGroup(
    SYNGO_PLAZA_PRODUCT,
    SYNGO_PLAZA_VERSION,
  );

  const assets = [];
  for (const spec of SYNGO_PLAZA_ASSETS) {
    assets.push(await upsertAsset(spec, deviceGroup.id, userId));
  }

  const vulnerability = await prisma.vulnerability.create({
    data: {
      cveId: SYNGO_PLAZA_CVE,
      severity: Severity.Medium,
      cvssScore: 5.3,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
      description:
        "syngo.plaza VB30E contains an insecure password encryption vulnerability that could allow an attacker to extract original passwords and might gain unauthorized access.",
      narrative:
        "The affected application does not encrypt passwords properly. An attacker who can read the stored credential material can recover the original passwords and use them to authenticate as a legitimate user.",
      impact:
        "Unauthorized access to the syngo.plaza PACS system used to display, process, and report on diagnostic images, including mammographic images.",
      userId,
      sarif: {
        version: "2.1.0",
        runs: [
          {
            tool: { driver: { name: "Siemens Healthineers PSIRT" } },
            results: [
              {
                ruleId: SYNGO_PLAZA_CVE,
                level: "warning",
                message: {
                  text: "Insecure password encryption in syngo.plaza VB30E (SSA-016040)",
                },
              },
            ],
          },
        ],
      },
      // Inline connect is required: the vulnerabilityExtension opens one baseline
      // Issue per matching linked at create time. Linking later creates none.
      deviceGroupMatchings: { connect: { id: matching.id } },
    },
  });

  await prisma.remediation.create({
    data: {
      description: "Update to VB30E_HF07 or later version",
      narrative:
        "Siemens Healthineers has released hot fix HF07 for syngo.plaza VB30E. Apply the hot fix during the next maintenance window to remediate the insecure password encryption.",
      vulnerabilityId: vulnerability.id,
      userId,
      deviceGroupMatchings: { connect: { id: matching.id } },
    },
  });

  await upsertAssetNote(userId, assets[2].id, SYNGO_PLAZA_EXCEPTION_NOTE);

  console.log(`  ✅ ${assets.length} assets, 1 matching, 1 vulnerability`);
}

async function printEnvironmentSummary() {
  const failures: string[] = [];

  const notifications = await prisma.notification.count();
  console.log(`\n  notifications                 ${notifications}`);
  if (notifications !== 0) {
    failures.push(
      `expected 0 notifications, found ${notifications} — the pipeline must create them, not this script`,
    );
  }

  for (const cveId of ADVISORY_CVES) {
    const vulnerability = await prisma.vulnerability.findFirst({
      where: { cveId },
      include: { deviceGroupMatchings: true, issues: true },
    });

    if (!vulnerability) {
      console.log(`\n  ${cveId}                (not seeded yet)`);
      continue;
    }

    const matchings = vulnerability.deviceGroupMatchings.length;
    const baseline = vulnerability.issues.filter(
      (issue) => issue.deviceGroupMatchingId !== null,
    ).length;
    const assetLevel = vulnerability.issues.filter(
      (issue) => issue.assetId !== null,
    ).length;

    console.log(`\n  ${cveId}`);
    console.log(`    device group matchings      ${matchings}`);
    console.log(`    baseline issues             ${baseline}`);
    console.log(`    asset-level issues          ${assetLevel}`);

    if (baseline !== matchings) {
      failures.push(
        `${cveId}: ${matchings} matching(s) but ${baseline} baseline issue(s) — the vulnerability must connect its matchings inline in the same create() call`,
      );
    }
    if (assetLevel !== 0) {
      failures.push(
        `${cveId}: ${assetLevel} asset-level issue(s) present — those are the VEX agent's output and must not be seeded`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("\n❌ Environment is not usable:");
    for (const failure of failures) console.error(`   - ${failure}`);
    throw new Error("Seed produced an unusable environment.");
  }

  console.log("\n  ✅ invariants hold");
}

async function main() {
  console.log("🚀 Preparing advisory test environment\n");
  assertLocalDatabase();

  const user = await getSeedUser();
  await resetInboxEnvironment();
  await seedSyngoPlazaEnvironment(user.id);
  await printEnvironmentSummary();

  console.log("\n✨ Done.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
