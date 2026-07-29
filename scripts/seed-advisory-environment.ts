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

const DESERIALIZATION_MATCHINGS: Array<{
  product: string;
  version?: string;
  versionRange?: string;
}> = [
  { product: "Biograph Horizon PET/CT Systems", version: "VJ30" },
  {
    product: "MAGNETOM Family",
    versionRange: "vers:generic/VA10B|VA12M|VA12S|VA20A|VA30A|VA31A",
  },
  { product: "MAMMOMAT Revelation", version: "VC20" },
  { product: "NAEOTOM Alpha", version: "VA40" },
  { product: "SOMATOM go.All", version: "VA30 SP5" },
  { product: "SOMATOM go.Now", version: "VA30 SP5" },
  { product: "SOMATOM go.Open Pro", version: "VA30 SP5" },
  { product: "SOMATOM go.Sim", version: "VA30 SP5" },
  { product: "SOMATOM go.Top", version: "VA30 SP5" },
  { product: "SOMATOM go.Up", version: "VA30 SP5" },
  { product: "SOMATOM X.cite", version: "VA30 SP5" },
  { product: "SOMATOM X.creed", version: "VA30 SP5" },
  { product: "Symbia E/S", version: "VB22" },
  { product: "Symbia Evo", version: "VB22" },
  { product: "Symbia Intevo", version: "VB22" },
  { product: "Symbia T", version: "VB22" },
  { product: "Symbia.net", version: "VB22" },
  {
    product: "syngo.via",
    versionRange: "vers:generic/VB10|VB20|VB30|VB40|VB50|VB60",
  },
];

const DESERIALIZATION_ASSETS: Array<
  AssetSpec & { product: string; version: string }
> = [
  {
    product: "MAGNETOM Family",
    version: "VA10B",
    ip: "10.60.0.11",
    hostname: "mri-magnetom-01",
    serialNumber: "MAGNETOM-VA10B-001",
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
    product: "MAGNETOM Family",
    version: "VA12S",
    ip: "10.60.0.12",
    hostname: "mri-magnetom-02",
    serialNumber: "MAGNETOM-VA12S-001",
    role: "MRI Scanner Console",
    networkSegment: "IMAGING-MRI",
    location: {
      facility: "Main Hospital",
      building: "Imaging Pavilion",
      floor: "1",
      room: "MRI Suite 2",
    },
  },
  {
    product: "MAGNETOM Family",
    version: "VA30A",
    ip: "10.60.0.13",
    hostname: "mri-magnetom-03",
    serialNumber: "MAGNETOM-VA30A-001",
    role: "MRI Scanner Console",
    networkSegment: "IMAGING-MRI-ISOLATED",
    location: {
      facility: "Main Hospital",
      building: "Imaging Pavilion",
      floor: "1",
      room: "MRI Suite 3",
    },
  },
  {
    product: "syngo.via",
    version: "VB50",
    ip: "10.60.1.11",
    hostname: "syngovia-01",
    serialNumber: "SYNGOVIA-VB50-001",
    role: "Imaging Workstation",
    networkSegment: "IMAGING-PACS",
    location: {
      facility: "Main Hospital",
      building: "Diagnostic Pavilion",
      floor: "2",
      room: "Reading Room C",
    },
  },
  {
    product: "syngo.via",
    version: "VB60",
    ip: "10.60.1.12",
    hostname: "syngovia-02",
    serialNumber: "SYNGOVIA-VB60-001",
    role: "Imaging Workstation",
    networkSegment: "IMAGING-PACS",
    location: {
      facility: "Main Hospital",
      building: "Diagnostic Pavilion",
      floor: "2",
      room: "Reading Room D",
    },
  },
  {
    product: "Symbia Intevo",
    version: "VB22",
    ip: "10.60.2.11",
    hostname: "symbia-intevo-01",
    serialNumber: "SYMBIA-INTEVO-VB22-001",
    role: "SPECT/CT Console",
    networkSegment: "IMAGING-NUCMED",
    location: {
      facility: "Main Hospital",
      building: "Imaging Pavilion",
      floor: "B1",
      room: "Nuclear Medicine 1",
    },
  },
  {
    product: "Symbia E/S",
    version: "VB22",
    ip: "10.60.2.12",
    hostname: "symbia-es-01",
    serialNumber: "SYMBIA-ES-VB22-001",
    role: "SPECT Console",
    networkSegment: "IMAGING-NUCMED",
    location: {
      facility: "Main Hospital",
      building: "Imaging Pavilion",
      floor: "B1",
      room: "Nuclear Medicine 2",
    },
  },
  {
    product: "SOMATOM go.Top",
    version: "VA30 SP5",
    ip: "10.60.3.11",
    hostname: "ct-somatom-gotop-01",
    serialNumber: "SOMATOM-GOTOP-VA30-001",
    role: "CT Scanner Console",
    networkSegment: "IMAGING-CT",
    location: {
      facility: "Main Hospital",
      building: "Imaging Pavilion",
      floor: "1",
      room: "CT Suite 1",
    },
  },
  {
    product: "NAEOTOM Alpha",
    version: "VA40",
    ip: "10.60.3.12",
    hostname: "ct-naeotom-01",
    serialNumber: "NAEOTOM-VA40-001",
    role: "Photon-Counting CT Console",
    networkSegment: "IMAGING-CT",
    location: {
      facility: "Main Hospital",
      building: "Imaging Pavilion",
      floor: "1",
      room: "CT Suite 2",
    },
  },
  {
    product: "Biograph Horizon PET/CT Systems",
    version: "VJ30",
    ip: "10.60.4.11",
    hostname: "pet-biograph-01",
    serialNumber: "BIOGRAPH-VJ30-001",
    role: "PET/CT Console",
    networkSegment: "IMAGING-NUCMED",
    location: {
      facility: "Main Hospital",
      building: "Imaging Pavilion",
      floor: "B1",
      room: "PET/CT Suite",
    },
  },
  {
    product: "MAMMOMAT Revelation",
    version: "VC20",
    ip: "10.60.5.11",
    hostname: "mammo-revelation-01",
    serialNumber: "MAMMOMAT-VC20-001",
    role: "Mammography System",
    networkSegment: "IMAGING-MAMMO",
    location: {
      facility: "Women's Health Center",
      building: "Main",
      floor: "1",
      room: "Mammography 1",
    },
  },
];

const DESERIALIZATION_EXCEPTION_NOTE =
  "mri-magnetom-03 is deployed in Siemens 'workstation mode' — the syngo client and server run on the same host, and ports 32912/tcp and 32914/tcp are closed for all inbound traffic on the host Windows firewall. The IMAGING-MRI-ISOLATED segment additionally blocks both ports at the boundary firewall, permitting only the service VPN jump host. Verified during the 2026-Q1 segmentation audit.";

async function seedDeserializationEnvironment(userId: string) {
  console.log("\n🌱 syngo deserialization environment (SSA-220609)...");

  // Sequential: several products share a canonical version ("VA30 SP5", "VB22"),
  // and concurrent upserts of the same Version race on its unique key.
  const matchings = [];
  for (const spec of DESERIALIZATION_MATCHINGS) {
    matchings.push(await upsertMatching(spec));
  }

  const assets = [];
  for (const spec of DESERIALIZATION_ASSETS) {
    const { product, version, ...assetFields } = spec;
    const deviceGroup = await upsertDeviceGroup(product, version);
    assets.push(await upsertAsset(assetFields, deviceGroup.id, userId));
  }

  const vulnerability = await prisma.vulnerability.create({
    data: {
      cveId: DESERIALIZATION_CVE,
      severity: Severity.Critical,
      cvssScore: 9.8,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:C",
      description:
        "The application deserialises untrusted data without sufficient validations, which could result in an arbitrary deserialization. This could allow an unauthenticated attacker to execute code in the affected system if ports 32912/tcp or 32914/tcp are reachable.",
      narrative:
        "An unauthenticated attacker who can reach ports 32912/tcp or 32914/tcp on an affected system can send a crafted serialized payload. Because the application deserializes untrusted data without validation (CWE-502), the payload is instantiated and can execute arbitrary code under the syngo platform's privileges.",
      impact:
        "Remote code execution on imaging systems (MRI, CT, PET/CT, SPECT/CT, mammography) and the syngo.via viewing and reporting platform, potentially disrupting diagnostic imaging workflows across radiology and nuclear medicine.",
      userId,
      sarif: {
        version: "2.1.0",
        runs: [
          {
            tool: { driver: { name: "Siemens Healthineers PSIRT" } },
            results: [
              {
                ruleId: DESERIALIZATION_CVE,
                level: "error",
                message: {
                  text: "Deserialization of untrusted data in Siemens Healthineers syngo platform (SSA-220609)",
                },
              },
            ],
          },
        ],
      },
      deviceGroupMatchings: { connect: matchings.map((m) => ({ id: m.id })) },
    },
  });

  await prisma.remediation.create({
    data: {
      description:
        "Update to the fixed version for each affected product, or block ports 32912/tcp and 32914/tcp at an external firewall",
      narrative:
        "Siemens Healthineers provides fixes for all affected versions. Where a fix cannot yet be applied, block ports 32912/tcp and 32914/tcp at an external firewall and, for workstation-mode installations, close both ports for inbound traffic on the host Windows firewall.",
      vulnerabilityId: vulnerability.id,
      userId,
      deviceGroupMatchings: { connect: matchings.map((m) => ({ id: m.id })) },
    },
  });

  const exceptionAsset = assets.find(
    (a) => a.serialNumber === "MAGNETOM-VA30A-001",
  );
  if (!exceptionAsset) {
    throw new Error("Expected MAGNETOM-VA30A-001 to exist after seeding.");
  }
  await upsertAssetNote(
    userId,
    exceptionAsset.id,
    DESERIALIZATION_EXCEPTION_NOTE,
  );

  console.log(
    `  ✅ ${assets.length} assets, ${matchings.length} matchings, 1 vulnerability`,
  );
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
  await seedDeserializationEnvironment(user.id);
  await printEnvironmentSummary();

  console.log("\n✨ Done.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
