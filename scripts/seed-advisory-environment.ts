// Run with the server-only stub, since it creates vulnerabilities through the record service:
//   npx tsx --require ./prisma/seeds/stub-server-only.cjs scripts/seed-advisory-environment.ts
import {
  createVulnerabilityRecord,
  type VulnerabilityRecordData,
} from "@/features/vulnerabilities/server/records";
import {
  type AssetStatus,
  MetricType,
  type Prisma,
  ScopeTargetModel,
  Severity,
  VersionStatus,
  VulnerabilitySource,
} from "@/generated/prisma";
import {
  deviceIdentitySelect,
  findAssetsStrictlyMatching,
} from "@/lib/device-matching";
import { upsertVersion } from "../prisma/seeds/dev/canonical-identity";
import { upsertExampleProduct as upsertProduct } from "../prisma/seeds/production/device-types";
import prisma from "../src/lib/db";

const SEED_USER_EMAIL = "user@example.com";

const SYNGO_PLAZA_CVE = "CVE-2024-52334";
const DESERIALIZATION_CVE = "CVE-2022-29875";
const ADVISORY_CVES = [SYNGO_PLAZA_CVE, DESERIALIZATION_CVE];
const ADVISORY_VULNERABILITY_WHERE = {
  identifiers: { some: { value: { in: ADVISORY_CVES } } },
} satisfies Prisma.VulnerabilityWhereInput;

/**
 * Create a vulnerability through the record service, which also opens the baseline Issues on its
 * matchings. The service copies narrative and impact only from a TA3 submission, so a vendor
 * advisory's are written onto the vulnerability here.
 */
async function createAdvisoryVulnerability(
  record: VulnerabilityRecordData,
  curated: { narrative: string; impact: string },
) {
  const { vulnerabilityId } = await createVulnerabilityRecord(record);
  return prisma.vulnerability.update({
    where: { id: vulnerabilityId },
    data: curated,
    select: { id: true },
  });
}

const SYNGO_PLAZA_EXCEPTION_SERIAL = "SYNGO-PLZ-VB30E-003";
const DESERIALIZATION_EXCEPTION_SERIAL = "MAGNETOM-VA30A-001";
const EXCEPTION_SERIALS = [
  SYNGO_PLAZA_EXCEPTION_SERIAL,
  DESERIALIZATION_EXCEPTION_SERIAL,
];

// Hosts on a fixed/newer build: the advisory must not reach them at all, so the
// affected-asset list is a real subset of the fleet rather than everything we own.
const OUT_OF_SCOPE_SERIALS = ["SYNGO-PLZ-VB30E-HF07-001", "SYNGOVIA-VB70-001"];

const MANUFACTURER = "Siemens Healthineers";

type AssetSpec = {
  ip: string;
  hostname: string;
  serialNumber: string;
  role: string;
  networkSegment: string;
  location: { facility: string; building: string; floor: string; room: string };
};

function upsertManufacturer(name: string) {
  const canonicalName = name.trim().toLowerCase();
  return prisma.manufacturer.upsert({
    where: { canonicalName },
    update: {},
    create: { canonicalName, canonicalDisplayName: name },
  });
}

async function upsertMatching(spec: {
  product: string;
  version?: string;
  versionRange?: string;
}) {
  const manufacturer = await upsertManufacturer(MANUFACTURER);
  const product = await upsertProduct(manufacturer.id, spec.product);
  const version = spec.version
    ? await upsertVersion(product.id, spec.version)
    : null;

  const identity = {
    manufacturerId: manufacturer.id,
    productId: product.id,
    versionId: version?.id ?? null,
    versionRange: spec.versionRange ?? null,
  };

  return (
    (await prisma.deviceGroupMatching.findFirst({ where: identity })) ??
    (await prisma.deviceGroupMatching.create({ data: identity }))
  );
}

type Device = Awaited<ReturnType<typeof upsertDevice>>;

async function upsertDevice(product: string, version: string) {
  const manufacturer = await upsertManufacturer(MANUFACTURER);
  const productRec = await upsertProduct(manufacturer.id, product);
  const versionRec = await upsertVersion(productRec.id, version);
  return {
    manufacturerId: manufacturer.id,
    productId: productRec.id,
    versionId: versionRec.id,
    versionStatus: VersionStatus.KNOWN,
  };
}

async function upsertAsset(spec: AssetSpec, device: Device, userId: string) {
  const existing = await prisma.asset.findFirst({
    where: { serialNumber: spec.serialNumber },
  });

  if (existing) {
    return prisma.asset.update({
      where: { id: existing.id },
      data: { ...spec, ...device },
    });
  }

  return prisma.asset.create({
    data: {
      ...spec,
      status: "Active" as AssetStatus,
      ...device,
      userId,
    },
  });
}

async function assetBySerial(serialNumber: string) {
  const asset = await prisma.asset.findFirst({ where: { serialNumber } });
  if (!asset) {
    throw new Error(`Expected ${serialNumber} to exist after seeding.`);
  }
  return asset;
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
  const user = await prisma.user.findUnique({
    where: { email: SEED_USER_EMAIL },
  });
  if (!user) {
    throw new Error(
      `No ${SEED_USER_EMAIL} in this database — run "npm run db:seed" first, then re-run this script.`,
    );
  }
  return user;
}

function seededSerials() {
  return [...SYNGO_PLAZA_ASSETS, ...DESERIALIZATION_ASSETS].map(
    (spec) => spec.serialNumber,
  );
}

async function seededAssetIds() {
  const assets = await prisma.asset.findMany({
    where: { serialNumber: { in: seededSerials() } },
    select: { id: true },
  });
  return assets.map((asset) => asset.id);
}

type MatchingRow = {
  manufacturerId: string;
  productId: string | null;
  versionId: string | null;
  versionRange: string | null;
};

async function assetsInScopeOf(matchings: MatchingRow[]) {
  const byId = new Map<
    string,
    { hostname: string | null; serialNumber: string | null }
  >();

  for (const matching of matchings) {
    const assets = await findAssetsStrictlyMatching([matching], (where) =>
      prisma.asset.findMany({
        where,
        select: { ...deviceIdentitySelect, hostname: true, serialNumber: true },
      }),
    );
    for (const asset of assets) {
      byId.set(asset.id, {
        hostname: asset.hostname,
        serialNumber: asset.serialNumber,
      });
    }
  }

  return [...byId.values()].sort((a, b) =>
    (a.hostname ?? "").localeCompare(b.hostname ?? ""),
  );
}

async function resetInboxEnvironment() {
  const notifications = await prisma.notification.deleteMany({});
  // A source is orphaned when nothing links to it any more.
  const orphanSources = await prisma.sourceRecord.deleteMany({
    where: { links: { none: {} } },
  });
  const draftTickets = await prisma.workOrderTicket.deleteMany({
    where: { isDraft: true },
  });
  const remediations = await prisma.remediation.deleteMany({
    where: { vulnerabilities: { some: ADVISORY_VULNERABILITY_WHERE } },
  });
  const vulnerabilities = await prisma.vulnerability.deleteMany({
    where: ADVISORY_VULNERABILITY_WHERE,
  });
  const notes = await prisma.note.deleteMany({
    where: {
      targetModel: ScopeTargetModel.ASSET,
      instanceId: { in: await seededAssetIds() },
    },
  });

  console.log(
    `  🧹 removed ${notifications.count} notification(s), ${orphanSources.count} orphan source(s), ${draftTickets.count} draft ticket(s), ${remediations.count} remediation(s), ${vulnerabilities.count} vulnerability(ies), ${notes.count} asset note(s)`,
  );
}

const SYNGO_PLAZA_PRODUCT = "syngo.plaza";
const SYNGO_PLAZA_VERSION = "VB30E";

const SYNGO_PLAZA_ASSETS: Array<AssetSpec & { version: string }> = [
  {
    version: SYNGO_PLAZA_VERSION,
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
    version: SYNGO_PLAZA_VERSION,
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
    version: SYNGO_PLAZA_VERSION,
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
  {
    version: "VB30E_HF07",
    ip: "10.50.0.14",
    hostname: "pacs-syngo-04",
    serialNumber: "SYNGO-PLZ-VB30E-HF07-001",
    role: "PACS Workstation",
    networkSegment: "RADIOLOGY-PACS",
    location: {
      facility: "Main Hospital",
      building: "Diagnostic Pavilion",
      floor: "3",
      room: "Reading Room C",
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

  const assets = [];
  for (const spec of SYNGO_PLAZA_ASSETS) {
    const { version, ...assetFields } = spec;
    const device = await upsertDevice(SYNGO_PLAZA_PRODUCT, version);
    assets.push(await upsertAsset(assetFields, device, userId));
  }

  const vulnerability = await createAdvisoryVulnerability(
    {
      source: VulnerabilitySource.VENDOR_ADVISORY,
      sourceId: "SSA-016040",
      identifiers: [SYNGO_PLAZA_CVE],
      details:
        "syngo.plaza VB30E contains an insecure password encryption vulnerability that could allow an attacker to extract original passwords and might gain unauthorized access.",
      metrics: [
        {
          type: MetricType.CVSS_V3_1,
          score: 5.3,
          vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
          severity: Severity.Medium,
        },
      ],
      deviceGroupMatchingIds: [matching.id],
      userId: null,
    },
    {
      narrative:
        "The affected application does not encrypt passwords properly. An attacker who can read the stored credential material can recover the original passwords and use them to authenticate as a legitimate user.",
      impact:
        "Unauthorized access to the syngo.plaza PACS system used to display, process, and report on diagnostic images, including mammographic images.",
    },
  );

  await prisma.remediation.create({
    data: {
      description: "Update to VB30E_HF07 or later version",
      narrative:
        "Siemens Healthineers has released hot fix HF07 for syngo.plaza VB30E. Apply the hot fix during the next maintenance window to remediate the insecure password encryption.",
      vulnerabilities: { connect: { id: vulnerability.id } },
      userId,
      deviceGroupMatchings: { connect: { id: matching.id } },
    },
  });

  const exceptionAsset = await assetBySerial(SYNGO_PLAZA_EXCEPTION_SERIAL);
  await createAssetNote(userId, exceptionAsset.id, SYNGO_PLAZA_EXCEPTION_NOTE);

  console.log(`  ✅ ${assets.length} assets, 1 matching, 1 vulnerability`);
}

// The advisory lists 18 products; these are the ones this hospital owns.
const DESERIALIZATION_MATCHINGS: Array<{
  product: string;
  version?: string;
  versionRange?: string;
}> = [
  {
    product: "MAGNETOM Family",
    versionRange: "vers:generic/VA10B|VA12M|VA12S|VA20A|VA30A|VA31A",
  },
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
    hostname: "mri-magnetom-05",
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
    version: "VB70",
    ip: "10.60.1.12",
    hostname: "syngovia-07",
    serialNumber: "SYNGOVIA-VB70-001",
    role: "Imaging Workstation",
    networkSegment: "IMAGING-PACS",
    location: {
      facility: "Main Hospital",
      building: "Diagnostic Pavilion",
      floor: "2",
      room: "Reading Room D",
    },
  },
];

const DESERIALIZATION_EXCEPTION_NOTE =
  "mri-magnetom-05 is deployed in Siemens 'workstation mode' — the syngo client and server run on the same host, and ports 32912/tcp and 32914/tcp are closed for all inbound traffic on the host Windows firewall. The IMAGING-MRI-ISOLATED segment additionally blocks both ports at the boundary firewall, permitting only the service VPN jump host. Verified during the 2026-Q1 segmentation audit.";

async function seedDeserializationEnvironment(userId: string) {
  console.log("\n🌱 syngo deserialization environment (SSA-220609)...");

  // Sequential, not Promise.all: products share canonical versions and race on the unique key.
  const matchings = [];
  for (const spec of DESERIALIZATION_MATCHINGS) {
    matchings.push(await upsertMatching(spec));
  }

  const assets = [];
  for (const spec of DESERIALIZATION_ASSETS) {
    const { product, version, ...assetFields } = spec;
    const device = await upsertDevice(product, version);
    assets.push(await upsertAsset(assetFields, device, userId));
  }

  const vulnerability = await createAdvisoryVulnerability(
    {
      source: VulnerabilitySource.VENDOR_ADVISORY,
      sourceId: "SSA-220609",
      identifiers: [DESERIALIZATION_CVE],
      details:
        "The application deserialises untrusted data without sufficient validations, which could result in an arbitrary deserialization. This could allow an unauthenticated attacker to execute code in the affected system if ports 32912/tcp or 32914/tcp are reachable.",
      metrics: [
        {
          type: MetricType.CVSS_V3_1,
          score: 9.8,
          vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:C",
          severity: Severity.Critical,
        },
      ],
      deviceGroupMatchingIds: matchings.map((m) => m.id),
      userId: null,
    },
    {
      narrative:
        "An unauthenticated attacker who can reach ports 32912/tcp or 32914/tcp on an affected system can send a crafted serialized payload. Because the application deserializes untrusted data without validation (CWE-502), the payload is instantiated and can execute arbitrary code under the syngo platform's privileges.",
      impact:
        "Remote code execution on imaging systems (MRI, CT, PET/CT, SPECT/CT, mammography) and the syngo.via viewing and reporting platform, potentially disrupting diagnostic imaging workflows across radiology and nuclear medicine.",
    },
  );

  await prisma.remediation.create({
    data: {
      description:
        "Update to the fixed version for each affected product, or block ports 32912/tcp and 32914/tcp at an external firewall",
      narrative:
        "Siemens Healthineers provides fixes for all affected versions. Where a fix cannot yet be applied, block ports 32912/tcp and 32914/tcp at an external firewall and, for workstation-mode installations, close both ports for inbound traffic on the host Windows firewall.",
      vulnerabilities: { connect: { id: vulnerability.id } },
      userId,
      deviceGroupMatchings: { connect: matchings.map((m) => ({ id: m.id })) },
    },
  });

  const exceptionAsset = await assetBySerial(DESERIALIZATION_EXCEPTION_SERIAL);
  await createAssetNote(
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
      where: { identifiers: { some: { value: cveId } } },
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

    const inScope = await assetsInScopeOf(vulnerability.deviceGroupMatchings);

    console.log(`\n  ${cveId}`);
    console.log(`    device group matchings      ${matchings}`);
    console.log(`    baseline issues             ${baseline}`);
    console.log(`    asset-level issues          ${assetLevel}`);
    console.log(
      `    assets in scope             ${inScope.length}  (${inScope.map((a) => a.hostname).join(", ")})`,
    );

    for (const asset of inScope) {
      if (OUT_OF_SCOPE_SERIALS.includes(asset.serialNumber ?? "")) {
        failures.push(
          `${cveId}: ${asset.hostname} runs a fixed build but the advisory still matches it — nothing is left unaffected`,
        );
      }
    }

    if (inScope.length === 0) {
      failures.push(
        `${cveId}: no assets in scope — the advisory would arrive with nothing to link to`,
      );
    }

    if (baseline !== matchings) {
      failures.push(
        `${cveId}: ${matchings} matching(s) but ${baseline} baseline issue(s) — create the vulnerability through createVulnerabilityRecord, which opens them`,
      );
    }
    if (assetLevel !== 0) {
      failures.push(
        `${cveId}: ${assetLevel} asset-level issue(s) present — those are the VEX agent's output and must not be seeded`,
      );
    }
  }

  const notedAssets = await prisma.asset.findMany({
    where: { serialNumber: { in: seededSerials() } },
    select: { id: true, hostname: true, serialNumber: true },
  });
  const notesByAsset = await prisma.note.findMany({
    where: {
      targetModel: ScopeTargetModel.ASSET,
      instanceId: { in: notedAssets.map((asset) => asset.id) },
    },
    select: { instanceId: true },
  });
  const notedIds = new Set(notesByAsset.map((note) => note.instanceId));

  const allMatchings = await prisma.deviceGroupMatching.findMany({
    where: { vulnerabilities: { some: ADVISORY_VULNERABILITY_WHERE } },
  });
  const reachable = new Set(
    (await assetsInScopeOf(allMatchings)).map((a) => a.serialNumber),
  );

  console.log("\n  exception notes");
  for (const serial of EXCEPTION_SERIALS) {
    const asset = notedAssets.find((a) => a.serialNumber === serial);
    const has = asset ? notedIds.has(asset.id) : false;
    console.log(`    ${asset?.hostname ?? serial}${has ? "" : "   MISSING"}`);
    if (!has) {
      failures.push(`${serial}: expected an asset-scoped note, found none`);
    }
    if (!reachable.has(serial)) {
      failures.push(
        `${serial}: carries the exception note but no advisory matching reaches it — VEX would never see it`,
      );
    }
  }

  const unexpected = notedAssets.filter(
    (asset) =>
      notedIds.has(asset.id) &&
      !EXCEPTION_SERIALS.includes(asset.serialNumber ?? ""),
  );
  for (const asset of unexpected) {
    failures.push(
      `${asset.hostname ?? asset.serialNumber}: carries a note but is meant to stay AFFECTED — VEX would except it`,
    );
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
