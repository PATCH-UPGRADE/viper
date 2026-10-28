// Run with the server-only stub, since it creates vulnerabilities through the record service:
//   npx tsx --require ./prisma/seeds/stub-server-only.cjs scripts/seed-notifications.ts
import type { HospitalImpact } from "@/features/inbox/types";
import { normalizeIdentifier } from "@/features/vulnerabilities/server/identity";
import {
  createVulnerabilityRecord,
  type VulnerabilityRecordData,
} from "@/features/vulnerabilities/server/records";
import {
  type AssetStatus,
  ConfidenceLevel,
  IssueStatus,
  MetricType,
  NotAffectedJustification,
  NotificationType,
  Priority,
  ScopeTargetModel,
  Severity,
  SourceChannel,
  Tlp,
  VersionStatus,
  VulnerabilitySource,
} from "@/generated/prisma";
import { sourceContentHash } from "@/lib/source-hash";
import { upsertVersion } from "../prisma/seeds/dev/canonical-identity";
import { upsertExampleProduct as upsertProduct } from "../prisma/seeds/production/device-types";
import prisma from "../src/lib/db";

const SEED_USER = {
  email: "user@example.com",
};

/**
 * The vulnerability that holds the record's first identifier, or a new one created through the
 * record service. The service copies narrative and impact only from a TA3 submission, so a
 * vendor advisory's are written onto the vulnerability here.
 */
async function findOrCreateAdvisoryVulnerability(
  record: VulnerabilityRecordData,
  curated: { narrative: string; impact: string },
) {
  const value = normalizeIdentifier(record.identifiers?.[0] ?? "")?.value;
  const existing = value
    ? await prisma.vulnerability.findFirst({
        where: { identifiers: { some: { value } } },
        select: { id: true },
      })
    : null;
  if (existing) return existing;

  const { vulnerabilityId } = await createVulnerabilityRecord(record);
  return prisma.vulnerability.update({
    where: { id: vulnerabilityId },
    data: curated,
    select: { id: true },
  });
}

// ---------------------------------------------------------------------------
// Canonical entity helpers
// ---------------------------------------------------------------------------

function upsertManufacturer(name: string) {
  const canonicalName = name.trim().toLowerCase();
  return prisma.manufacturer.upsert({
    where: { canonicalName },
    update: {},
    create: { canonicalName, canonicalDisplayName: name },
  });
}

// ---------------------------------------------------------------------------
// Siemens syngo.plaza VEX scenario (SSA-016040 / CVE-2024-52334)
// ---------------------------------------------------------------------------
//
// Exercises the vex agent's asset-level override path: the device group as a
// whole is affected by the CVE, but a Note on one specific asset gives the
// agent grounds to mark that asset NOT_AFFECTED while the sibling asset (and
// the group-level issue) stay AFFECTED.

const SYNGO_PLAZA = {
  manufacturer: "Siemens Healthineers",
  product: "syngo.plaza",
  version: "VB30E",
};

const REMEDIATION_TEXT = "Update to VB30E_HF07 or later";

const SYNGO_PLAZA_ASSETS = [
  {
    ip: "10.50.0.11",
    hostname: "pacs-syngo-01",
    serialNumber: "SYNGO-PLZ-VB30E-001",
    role: "PACS Workstation",
    networkSegment: "RADIOLOGY-PACS",
  },
  {
    ip: "10.50.0.12",
    hostname: "pacs-syngo-02",
    serialNumber: "SYNGO-PLZ-VB30E-002",
    role: "PACS Workstation",
    networkSegment: "RADIOLOGY-PACS",
  },
];

// Mock differnt use cases
const QUESTION_CASES = [
  {
    product: "syngo.via",
    audience: "VENDOR" as const,
    expect: "VENDOR GE Healthcare - dropdown, 2 contacts",
  },
  {
    product: "MAGNETOM FAMILY",
    audience: "VENDOR" as const,
    expect: "VENDOR Philips - dropdown, 1 contact",
  },
  { product: "Symbia Intevo", expect: "MANUFACTURER - no contacts, input" },
];

const MIXED_TLP_SOURCES = [
  {
    externalId: "seed-mixed-tlp-medisao",
    tlp: Tlp.AMBER,
    from: "MedISAO <advisories@medisao.org>",
    subject: "MedISAO channel advisory: syngo.plaza credential exposure",
    receivedAt: "2026-09-11T09:00:00.000Z",
    reasonWhy: "Same advisory, reported through the MedISAO channel.",
    markdown:
      "## MedISAO channel advisory\n\nMembers report the same syngo.plaza VB30E credential weakness.",
  },
  {
    externalId: "seed-mixed-tlp-cisa",
    tlp: Tlp.WHITE,
    from: "CISA <advisories@cisa.org>",
    subject: "ICSMA: Siemens Healthineers syngo.plaza",
    receivedAt: "2026-09-12T09:00:00.000Z",
    reasonWhy: "CISA published an advisory covering the same CVE.",
    markdown:
      "## ICSMA-26-041-01\n\nCISA has published an ICS medical advisory covering CVE-2024-52334 in syngo.plaza VB30E",
  },
  {
    externalId: "seed-mixed-tlp-productcert",
    tlp: Tlp.GREEN,
    from: "Siemens ProductCERT<productcert@cisa.org>",
    subject: "SSA-016040 update: fix availability",
    receivedAt: "2026-09-13T09:00:00.000Z",
    reasonWhy: "Vendor follow-up on the same SSA.",
    markdown:
      "## SSA-016040 update\n\nProductCERT HF07confirms resolves the issue and is available for all supported installations.",
  },
];

async function seedSyngoPlazaVexScenario(userId: string) {
  console.log("\n🌱 Seeding Siemens syngo.plaza VEX scenario...");

  const manufacturer = await upsertManufacturer(SYNGO_PLAZA.manufacturer);
  const product = await upsertProduct(manufacturer.id, SYNGO_PLAZA.product);
  const version = await upsertVersion(product.id, SYNGO_PLAZA.version);

  const device = {
    manufacturerId: manufacturer.id,
    productId: product.id,
    versionId: version.id,
    versionStatus: VersionStatus.KNOWN,
  };

  const assets = await Promise.all(
    SYNGO_PLAZA_ASSETS.map(async (asset) => {
      const existing = await prisma.asset.findFirst({
        where: { serialNumber: asset.serialNumber },
      });
      if (existing) return existing;
      return prisma.asset.create({
        data: {
          ...asset,
          status: "Active" as AssetStatus,
          ...device,
          userId,
        },
      });
    }),
  );

  const matching =
    (await prisma.deviceGroupMatching.findFirst({
      where: {
        manufacturerId: manufacturer.id,
        productId: product.id,
        versionId: version.id,
        versionRange: null,
      },
    })) ??
    (await prisma.deviceGroupMatching.create({
      data: {
        manufacturerId: manufacturer.id,
        productId: product.id,
        versionId: version.id,
      },
    }));

  const vulnerability = await findOrCreateAdvisoryVulnerability(
    {
      source: VulnerabilitySource.VENDOR_ADVISORY,
      sourceId: "SSA-016040",
      identifiers: ["CVE-2024-52334"],
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
        "Unauthorized access to the syngo.plaza PACS system used to display, process, and report on diagnostic images, including mammography.",
    },
  );

  const remediation =
    (await prisma.remediation.findFirst({
      where: {
        vulnerabilities: { some: { id: vulnerability.id } },
        description: REMEDIATION_TEXT,
      },
    })) ??
    (await prisma.remediation.create({
      data: {
        description: REMEDIATION_TEXT,
        narrative:
          "Siemens Healthineers has released hot fix HF07 for syngo.plaza VB30E. Apply the hot fix during the next maintenance window to remediate the insecure password encryption.",
        vulnerabilities: { connect: { id: vulnerability.id } },
        userId,
        deviceGroupMatchings: { connect: { id: matching.id } },
      },
    }));

  // Group-level Issue lives on one asset; the sibling asset keeps the Note below.
  const issueAsset = assets[0];
  await prisma.issue.upsert({
    where: {
      assetId_vulnerabilityId: {
        assetId: issueAsset.id,
        vulnerabilityId: vulnerability.id,
      },
    },
    update: {
      status: IssueStatus.UNDER_INVESTIGATION,
    },
    create: {
      assetId: issueAsset.id,
      vulnerabilityId: vulnerability.id,
      status: IssueStatus.UNDER_INVESTIGATION,
    },
  });
  // for baseline devieGroupMatchingId set issues
  await prisma.issue.upsert({
    where: {
      deviceGroupMatchingId_vulnerabilityId: {
        deviceGroupMatchingId: matching.id,
        vulnerabilityId: vulnerability.id,
      },
    },
    update: {
      status: IssueStatus.UNDER_INVESTIGATION,
      statusNotes:
        "Unable to confirm from the advisory whether remote password recover requires physical console access or is exploitable over the network.",
    },
    create: {
      deviceGroupMatchingId: matching.id,
      vulnerabilityId: vulnerability.id,
      status: IssueStatus.UNDER_INVESTIGATION,
      statusNotes:
        "Unable to confirm from the advisory whether remote password recover requires physical console access or is exploitable over the network.",
    },
  });

  const title =
    "Siemens Healthineers syngo.plaza VB30E — Insecure Password Encryption (SSA-016040 / CVE-2024-52334)";

  const existingNotification = await prisma.notification.findFirst({
    where: { title },
  });
  if (existingNotification) {
    console.log(`  ⏭️  Already exists: ${title}`);
    return;
  }

  const notification = await prisma.notification.create({
    data: {
      title,
      summary:
        "Siemens Healthineers has disclosed an insecure password encryption vulnerability in syngo.plaza VB30E (CVE-2024-52334). The affected application does not encrypt passwords properly, which could allow an attacker to extract original passwords and gain unauthorized access. A hot fix (HF07) is available.",
      type: NotificationType.Advisory,
      priority: Priority.High,
      hospitalImpact: {
        byline:
          "Credential exposure on 2 PACS workstations could grant unauthorized access to imaging systems.",
        impactStatement:
          "Affects 2 syngo.plaza PACS workstations running pre-hotfix VB30E. If exploited, an attacker with access to stored credential material could recover passwords and gain unauthorized access to the PACS system.",
        careAreas: "Radiology — PACS workstations",
        likelihood:
          "Requires access to stored credential material · no known active exploitation · hot fix HF07 available",
      } satisfies HospitalImpact,
      priorityReasonWhy:
        "No known active exploitation and requires access to stored credential material, but affects PACS authentication broadly. Siemens has published hot fix HF07 — schedule during the next maintenance window.",
    },
  });

  const ssa016040Raw = {
    type: "email.received",
    created_at: "2026-02-10T09:00:00.000Z",
    data: {
      email_id: "seed-ssa-016040",
      created_at: "2026-02-10T09:00:00.000Z",
      from: "psirt@siemens-healthineers.com",
      to: ["security@hospital.org"],
      cc: [],
      bcc: [],
      subject:
        "SSA-016040: Insecure Password Encryption Vulnerability in syngo.plaza VB30E",
      attachments: [],
    },
  };
  const ssa016040Markdown = `# SSA-016040: Insecure Password Encryption Vulnerability in syngo.plaza VB30E

**Publication Date**: 2026-02-10 · **CVSS v3.1**: 5.3 · **CVSS v4.0**: 6.3

## Summary
syngo.plaza VB30E contains an insecure password encryption vulnerability that could allow an attacker to extract original passwords and might gain unauthorized access.

Siemens Healthineers has released a new hot fix (HF07) for syngo.plaza version VB30E and recommends updating to the latest version.

## Affected products and solution
- **syngo.plaza VB30E**, all versions < VB30E_HF07 — affected by CVE-2024-52334
- **Remediation**: Update to VB30E_HF07 or later.

## Vulnerability classification (CVE-2024-52334)
The affected application does not encrypt passwords properly. This could allow an attacker to recover the original passwords and might gain unauthorized access.

- CVSS v3.1 Vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N
- CWE-261: Weak Encoding for Password`;

  await prisma.sourceRecord.create({
    data: {
      channel: SourceChannel.Email,
      tlp: Tlp.WHITE,
      links: {
        create: { notificationId: notification.id, sourceType: "Source" },
      },
      externalId: "seed-ssa-016040",
      contentHash: sourceContentHash(ssa016040Raw, ssa016040Markdown),
      raw: ssa016040Raw,
      markdown: ssa016040Markdown,
      observedAt: new Date(),
    },
  });

  await prisma.notificationVulnerabilityMapping.create({
    data: {
      notificationId: notification.id,
      vulnerabilityId: vulnerability.id,
      confidence: ConfidenceLevel.Confirmed,
      reasonWhy:
        "CVE-2024-52334 explicitly named in the manufacturer advisory.",
    },
  });

  await prisma.notificationDeviceGroupMapping.create({
    data: {
      notificationId: notification.id,
      deviceGroupMatchingId: matching.id,
      confidence: ConfidenceLevel.Confirmed,
      reasonWhy:
        "Manufacturer, product, and affected version range matched from the advisory's affected-products table.",
    },
  });

  await prisma.notificationRemediationMapping.create({
    data: {
      notificationId: notification.id,
      remediationId: remediation.id,
      confidence: ConfidenceLevel.Confirmed,
      reasonWhy:
        "Advisory's affected-products table lists 'Update to VB30E_HF07 or later' as the remediation.",
    },
  });

  const notedAsset = assets[1];
  await prisma.note.create({
    data: {
      userId,
      text: `${notedAsset.hostname} had its local password store migrated to the hospital's centralized SSO/Active Directory integration. This asset no longer manages its own password store.`,
      targetModel: ScopeTargetModel.ASSET,
      instanceId: notedAsset.id,
    },
  });

  console.log(`  ✅ Created: ${title}`);
}

// ---------------------------------------------------------------------------
// Siemens deserialization scenario (SSA-220609 / CVE-2022-29875)
// ---------------------------------------------------------------------------
//
// A single notification spanning ~18 Siemens Healthineers products, all affected
// by one CVE (CVSS 9.8, unauthenticated RCE). Exercises multi-matching
// notifications plus an asset-level NOT_AFFECTED issue backed by a compensating
// control (the vulnerable ports are firewalled at the segment boundary).

const DESERIALIZATION_MANUFACTURER = "Siemens Healthineers";

// Affected products from the advisory's affected-products table. Use `versionRange`
// (a `vers:` string) when the advisory enumerates multiple versions; otherwise an
// exact `version`.
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
  { product: "MAMMOMAT Revelation", version: "VC20D" },
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

// Assets, each bucketed into a DeviceGroup keyed by exact version.
const DESERIALIZATION_ASSETS: Array<{
  product: string;
  version?: string;
  versionStatus?: "UNSURE";
  ip: string;
  hostname: string;
  serialNumber: string;
  role: string;
  networkSegment: string;
}> = [
  {
    product: "MAGNETOM Family",
    version: "VA10B",
    ip: "10.60.0.11",
    hostname: "mri-magnetom-01",
    serialNumber: "MAGNETOM-VA10B-001",
    role: "MRI Scanner Console",
    networkSegment: "IMAGING-MRI",
  },
  {
    product: "MAGNETOM Family",
    version: "VA12S",
    ip: "10.60.0.12",
    hostname: "mri-magnetom-02",
    serialNumber: "MAGNETOM-VA12S-001",
    role: "MRI Scanner Console",
    networkSegment: "IMAGING-MRI",
  },
  {
    product: "syngo.via",
    version: "VB50",
    ip: "10.60.1.11",
    hostname: "syngovia-01",
    serialNumber: "SYNGOVIA-VB50-001",
    role: "Imaging Workstation",
    networkSegment: "IMAGING-PACS",
  },
  {
    product: "syngo.via",
    version: "VB50",
    ip: "10.60.1.12",
    hostname: "syngovia-02",
    serialNumber: "SYNGOVIA-VB50-002",
    role: "Imaging Workstation",
    networkSegment: "IMAGING-PACS",
  },
  {
    product: "syngo.via",
    version: "VB50",
    ip: "10.60.1.13",
    hostname: "syngovia-03",
    serialNumber: "SYNGOVIA-VB50-003",
    role: "Imaging Workstation",
    networkSegment: "IMAGING-PACS",
  },
  {
    product: "syngo.via",
    version: "VB60",
    ip: "10.60.1.14",
    hostname: "syngovia-04",
    serialNumber: "SYNGOVIA-VB60-001",
    role: "Imaging Workstation",
    networkSegment: "IMAGING-PACS",
  },
  {
    product: "syngo.via",
    version: "VB60",
    ip: "10.60.1.15",
    hostname: "syngovia-05",
    serialNumber: "SYNGOVIA-VB60-002",
    role: "Imaging Workstation",
    networkSegment: "IMAGING-PACS",
  },
  {
    product: "Symbia Intevo",
    version: "VB22",
    ip: "10.60.2.11",
    hostname: "symbia-intevo-01",
    serialNumber: "SYMBIA-INTEVO-VB22-001",
    role: "SPECT/CT Console",
    networkSegment: "IMAGING-NUCMED",
  },
  {
    product: "MAGNETOM Family",
    ip: "10.60.0.13",
    hostname: "mri-magnetom-03",
    serialNumber: "MAGNETOM-UNKNOWN-001",
    role: "MRI Scanner Console",
    networkSegment: "IMAGING-MRI",
  },
  {
    product: "MAGNETOM Family",
    versionStatus: "UNSURE",
    ip: "10.60.0.14",
    hostname: "mri-magnetom-04",
    serialNumber: "MAGNETOM-UNSURE-001",
    role: "MRI Scanner Console",
    networkSegment: "IMAGING-MRI",
  },
];

async function upsertDeserializationMatching(spec: {
  product: string;
  version?: string;
  versionRange?: string;
}) {
  const manufacturer = await upsertManufacturer(DESERIALIZATION_MANUFACTURER);
  const product = await upsertProduct(manufacturer.id, spec.product);
  const version = spec.version
    ? await upsertVersion(product.id, spec.version)
    : null;

  const where = {
    manufacturerId: manufacturer.id,
    productId: product.id,
    versionId: version?.id ?? null,
    versionRange: spec.versionRange ?? null,
  };

  return (
    (await prisma.deviceGroupMatching.findFirst({ where })) ??
    (await prisma.deviceGroupMatching.create({ data: where }))
  );
}

async function upsertDeviceForAsset(
  product: string,
  version?: string,
  versionStatus: VersionStatus = version
    ? VersionStatus.KNOWN
    : VersionStatus.UNKNOWN,
) {
  const manufacturer = await upsertManufacturer(DESERIALIZATION_MANUFACTURER);
  const productRec = await upsertProduct(manufacturer.id, product);
  const versionRec = version
    ? await upsertVersion(productRec.id, version)
    : null;

  return {
    manufacturerId: manufacturer.id,
    productId: productRec.id,
    versionId: versionRec?.id ?? null,
    versionStatus,
  };
}

async function seedDeserializationScenario(userId: string) {
  console.log("\n🌱 Seeding Siemens deserialization scenario...");

  // Sequential: several matchings share a product and version, and concurrent
  // upserts of the same Version race on its unique key.
  const matchings: Awaited<ReturnType<typeof upsertDeserializationMatching>>[] =
    [];
  for (const spec of DESERIALIZATION_MATCHINGS) {
    matchings.push(await upsertDeserializationMatching(spec));
  }

  const vulnerability = await findOrCreateAdvisoryVulnerability(
    {
      source: VulnerabilitySource.VENDOR_ADVISORY,
      sourceId: "SSA-220609",
      identifiers: ["CVE-2022-29875"],
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
        "Remote code execution on imaging systems (MRI, CT, PET/CT, SPECT/CT, mammography) and the syngo.via viewing/reporting platform, potentially disrupting diagnostic imaging workflows across radiology and nuclear medicine.",
    },
  );

  // Assets, keyed to their exact-version DeviceGroups. Sequential for the same
  // reason as the matchings: multiple assets share a product/version DeviceGroup
  // (3× syngo.via VB50, 2× VB60), whose canonical entities race under Promise.all.
  const assets: Awaited<ReturnType<typeof prisma.asset.create>>[] = [];
  for (const spec of DESERIALIZATION_ASSETS) {
    const existing = await prisma.asset.findFirst({
      where: { serialNumber: spec.serialNumber },
    });
    if (existing) {
      assets.push(existing);
      continue;
    }
    const device = await upsertDeviceForAsset(
      spec.product,
      spec.version,
      spec.versionStatus === "UNSURE" ? VersionStatus.UNSURE : undefined,
    );
    const {
      product: _product,
      version: _version,
      versionStatus: _versionStatus,
      ...assetFields
    } = spec;
    assets.push(
      await prisma.asset.create({
        data: {
          ...assetFields,
          status: "Active" as AssetStatus,
          ...device,
          userId,
        },
      }),
    );
  }

  // NOT_AFFECTED issue on the Symbia Intevo asset — compensating control blocks
  // the vulnerable ports so the deserialization path is unreachable.
  const symbiaAsset = assets.find(
    (_, i) => DESERIALIZATION_ASSETS[i].product === "Symbia Intevo",
  );
  if (symbiaAsset) {
    await prisma.issue.upsert({
      where: {
        assetId_vulnerabilityId: {
          assetId: symbiaAsset.id,
          vulnerabilityId: vulnerability.id,
        },
      },
      update: {
        status: IssueStatus.NOT_AFFECTED,
        notAffectedJustification:
          NotAffectedJustification.HOSPITAL_COMPENSATING_CONTROL,
        statusConfidence: ConfidenceLevel.Confirmed,
        statusNotes:
          "Ports 32912/tcp and 32914/tcp are blocked inbound at the IMAGING-NUCMED segment firewall for all but trusted service clients, so the deserialization RCE path is unreachable on this SPECT/CT console.",
      },
      create: {
        assetId: symbiaAsset.id,
        vulnerabilityId: vulnerability.id,
        status: IssueStatus.NOT_AFFECTED,
        notAffectedJustification:
          NotAffectedJustification.HOSPITAL_COMPENSATING_CONTROL,
        statusConfidence: ConfidenceLevel.Confirmed,
        statusNotes:
          "Ports 32912/tcp and 32914/tcp are blocked inbound at the IMAGING-NUCMED segment firewall for all but trusted service clients, so the deserialization RCE path is unreachable on this SPECT/CT console.",
      },
    });
  }

  const title =
    "Siemens Healthineers — Deserialization Vulnerability in Healthcare Products (SSA-220609 / CVE-2022-29875)";

  const existingNotification = await prisma.notification.findFirst({
    where: { title },
  });
  if (existingNotification) {
    console.log(`  ⏭️  Already exists: ${title}`);
    return;
  }

  const notification = await prisma.notification.create({
    data: {
      title,
      summary:
        "Siemens Healthineers has disclosed a deserialization vulnerability (CVE-2022-29875, CVSS 9.8) in the syngo platform shared across many imaging products. An unauthenticated attacker who can reach ports 32912/tcp or 32914/tcp can execute arbitrary code. Fixes are available for all affected versions; port-blocking mitigations apply where fixes cannot yet be installed.",
      type: NotificationType.Advisory,
      priority: Priority.Critical,
      hospitalImpact: {
        byline:
          "Unauthenticated RCE across hospital-wide imaging infrastructure could halt diagnostic imaging and reporting.",
        impactStatement:
          "Affects imaging systems across radiology and nuclear medicine (MRI, CT, PET/CT, SPECT/CT, mammography) and syngo.via viewing/reporting workstations. Successful exploitation could disrupt diagnostic imaging and reporting workflows hospital-wide.",
        careAreas:
          "Radiology & Nuclear Medicine — MRI, CT, PET/CT, SPECT/CT, mammography, syngo.via reading/reporting",
        likelihood:
          "Unauthenticated network RCE (CVSS 9.8) · gated on reachability of ports 32912/tcp & 32914/tcp · manufacturer fixes available",
      } satisfies HospitalImpact,
      priorityReasonWhy:
        "Unauthenticated remote code execution (CVSS 9.8) on life-adjacent imaging infrastructure. Exploitability is gated on reachability of ports 32912/tcp and 32914/tcp — block them at the network boundary immediately and schedule the manufacturer fixes.",
    },
  });

  const ssa220609Raw = {
    type: "email.received",
    created_at: "2022-06-09T09:00:00.000Z",
    data: {
      email_id: "seed-ssa-220609",
      created_at: "2022-06-09T09:00:00.000Z",
      from: "Siemens Healthcare psirt@siemens-healthineers.com",
      to: ["security@hospital.org"],
      cc: [],
      bcc: [],
      subject:
        "SSA-220609: Deserialization Vulnerability in Healthcare Products",
      attachments: [],
    },
  };
  const ssa220609Markdown = `# SSA-220609: Deserialization Vulnerability in Healthcare Products

**Publication Date**: 2022-05-31 · **Last Update**: 2022-06-09 · **CVSS v3.1**: 9.8

## Summary
A deserialization vulnerability is present in syngo which could allow an unauthenticated attacker to perform remote code execution under certain circumstances. Multiple Siemens Healthineers products use this platform and are affected by varying degrees.

## Vulnerability classification (CVE-2022-29875)
The application deserialises untrusted data without sufficient validations that could result in an arbitrary deserialization. This could allow an unauthenticated attacker to execute code in the affected system if ports 32912/tcp or 32914/tcp are reachable.

- CVSS v3.1 Vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:C
- CWE-502: Deserialization of Untrusted Data

## Workarounds and mitigations
- If possible, block ports 32912/tcp and 32914/tcp on an external firewall.
- Product-specific fixes are available; contact your local Siemens Healthineers service representative.`;

  await prisma.sourceRecord.create({
    data: {
      channel: SourceChannel.Email,
      tlp: Tlp.WHITE,
      links: {
        create: { notificationId: notification.id, sourceType: "Source" },
      },
      externalId: "seed-ssa-220609",
      contentHash: sourceContentHash(ssa220609Raw, ssa220609Markdown),
      raw: ssa220609Raw,
      markdown: ssa220609Markdown,
      observedAt: new Date(),
    },
  });

  await prisma.notificationVulnerabilityMapping.create({
    data: {
      notificationId: notification.id,
      vulnerabilityId: vulnerability.id,
      confidence: ConfidenceLevel.Confirmed,
      reasonWhy:
        "CVE-2022-29875 explicitly named in the manufacturer advisory.",
    },
  });

  await Promise.all(
    matchings.map((matching) =>
      prisma.notificationDeviceGroupMapping.create({
        data: {
          notificationId: notification.id,
          deviceGroupMatchingId: matching.id,
          confidence: ConfidenceLevel.Confirmed,
          reasonWhy:
            "Manufacturer, product, and affected version(s) matched from the advisory's affected-products table.",
        },
      }),
    ),
  );

  console.log(`  ✅ Created: ${title}`);
}

async function assetIdsForProducts(products: string[]): Promise<string[]> {
  const assets = await prisma.asset.findMany({
    where: {
      product: {
        canonicalName: {
          in: products.map((product) => product.trim().toLowerCase()),
        },
      },
    },
    select: { id: true },
  });

  return assets.map((asset) => asset.id);
}

async function seedManageBy(args: {
  vendorId: string;
  responsibilities: string;
  products: string[];
  contract?: { title: string; from: string; to: string };
}) {
  const assetIds = await assetIdsForProducts(args.products);
  const relationship = await prisma.managesRelationship.create({
    data: {
      responsibilities: args.responsibilities,
      vendorId: args.vendorId,
      assets: { connect: assetIds.map((id) => ({ id })) },
    },
  });

  if (args.contract) {
    await prisma.contract.create({
      data: {
        vendorId: args.vendorId,
        title: args.contract.title,
        effectiveFrom: new Date(args.contract.from),
        effectiveTo: new Date(args.contract.to),
        managesRelationshipId: relationship.id,
      },
    });
  }
  console.log(`${args.responsibilities}: ${assetIds.length} assets`);
  return relationship;
}

async function seedQuestion() {
  await prisma.question.deleteMany({
    where: { status: { in: ["PENDING", "UNSURE"] } },
  });

  for (const { product, audience, expect } of QUESTION_CASES) {
    const canonicalName = product.trim().toLowerCase();

    const mapping = await prisma.notificationDeviceGroupMapping.findFirst({
      where: {
        notificationId: { not: null },
        deviceGroupMatching: { product: { canonicalName } },
      },

      select: {
        notificationId: true,
        deviceGroupMatchingId: true,
        notification: { select: { title: true } },
      },
    });

    if (!mapping?.notificationId) {
      console.log(`No notification mapping found for ${product}`);
      continue;
    }

    const issue = await prisma.issue.findFirst({
      where: { deviceGroupMatchingId: mapping?.deviceGroupMatchingId },
      select: { id: true },
    });

    if (!issue) {
      console.log(`No issue on the ${product} matching`);
      continue;
    }

    await prisma.question.create({
      data: {
        issueId: issue.id,
        audience,
        notificationId: mapping.notificationId,
        title: `Which ${product} version is running on our units?`,
        reasonWhy: `The advisory lists affected ${product} versions, but our inventory records the version as unknown, so we cannot confirm exposure.`,
        suggestedAnswers: [
          "Yes, we should look into it",
          "No, isolated",
          "Partially, needs checking",
        ],
      },
    });

    await prisma.question.create({
      data: {
        issueId: issue.id,
        audience,
        notificationId: mapping.notificationId,
        title: `Are the ${product} units reachable from the clinical VLAN?`,
        reasonWhy: `Exposure depends on segmentation, which the advisory cannot tell us.`,
        status: "UNSURE",
      },
    });

    console.log(`  ✅ Seeded ${product} -> expect ${expect}`);
  }

  console.log(`  ✅ Seeded UNSURE question`);
}

async function seedVendorCoverage() {
  console.log("\n🌱 Seeding vendor coverage...");

  const sieManu = await upsertManufacturer("Siemens Healthineers");
  const geManu = await upsertManufacturer("GE Healthcare");
  const phillipsManu = await upsertManufacturer("Philips");

  const shVendor = await prisma.vendor.upsert({
    where: { canonicalName: "siemens healthineers" },
    update: { manufacturerId: sieManu.id },
    create: {
      canonicalName: "siemens healthineers",
      canonicalDisplayName: "Siemens Healthineers",
      overview: "Manages imaging fleet for radiology",
      partnerSince: new Date("2019-01-01"),
      manufacturerId: sieManu.id,
    },
  });
  const geVendor = await prisma.vendor.upsert({
    where: { canonicalName: "ge healthcare" },
    update: { manufacturerId: geManu.id },
    create: {
      canonicalName: "ge healthcare",
      canonicalDisplayName: "GE Healthcare",
      overview: "Multivendor managed service across the imaging fleet",
      partnerSince: new Date("2019-02-01"),
      manufacturerId: geManu.id,
    },
  });

  const phillipVendor = await prisma.vendor.upsert({
    where: { canonicalName: "philips" },
    update: { manufacturerId: phillipsManu.id },
    create: {
      canonicalName: "philips",
      canonicalDisplayName: "Philips",
      overview: "Mantains the MRI fleet under a single-engineer contract.",
      partnerSince: new Date("2019-03-01"),
      manufacturerId: phillipsManu.id,
    },
  });

  const vendorIds = [shVendor.id, geVendor.id, phillipVendor.id];
  await prisma.contract.deleteMany({ where: { vendorId: { in: vendorIds } } });
  await prisma.vendorContact.deleteMany({
    where: { vendorId: { in: vendorIds } },
  });

  await prisma.vendorContact.createMany({
    data: [
      {
        vendorId: shVendor.id,
        name: "John Doe",
        title: "Hospital Biomed Lead",
        email: "johndoe@example.com",
        phone: "123-456-7890",
        notes: "Usually responds the fastest",
      },
      {
        vendorId: shVendor.id,
        name: "Jane Doe",
        title: "IT engineer",
        email: "janedoe@example.com",
      },
      {
        vendorId: geVendor.id,
        name: "Gordon Doe",
        title: "Field service engineer",
        email: "gordondoe@example.com",
      },
      {
        vendorId: phillipVendor.id,
        name: "Phillips Doe",
        title: "Admin",
        phone: "908-765-4321",
      },
    ],
  });

  await seedManageBy({
    vendorId: shVendor.id,
    responsibilities: "",
    products: ["syngo.via"],
    contract: {
      title: "Manages imaging fleet for radiology",
      from: "2023-01-01",
      to: "2030-01-01",
    },
  });

  await seedManageBy({
    vendorId: geVendor.id,
    responsibilities: "manage field service",
    products: ["Symbia Intevo"],
    contract: {
      title: "Multivendor managed service across the imaging fleet",
      from: "2024-01-01",
      to: "2028-01-01",
    },
  });
  await seedManageBy({
    vendorId: phillipVendor.id,
    responsibilities: "manage field service",
    products: ["MAGNETOM FAMILY"],
    contract: {
      title: "MRI Fleet Managed Service Agreement",
      from: "2021-01-01",
      to: "2026-01-01",
    },
  });
}

async function seedMixedTlpSources() {
  console.log(`  ✅ Seeded mixed TLP sources...`);
  const anchor = await prisma.sourceRecord.findUnique({
    where: {
      channel_externalId: {
        channel: SourceChannel.Email,
        externalId: "seed-ssa-016040",
      },
    },
    select: { links: { select: { notificationId: true } } },
  });

  const notificationId = anchor?.links[0].notificationId;
  if (!notificationId) return;

  await prisma.sourceRecord.deleteMany({
    where: { externalId: { in: MIXED_TLP_SOURCES.map((s) => s.externalId) } },
  });

  for (const source of MIXED_TLP_SOURCES) {
    const raw = {
      type: "email.received",
      created_at: source.receivedAt,
      data: {
        email_id: source.externalId,
        created_at: source.receivedAt,
        from: source.from,
        to: ["security@hospital.org"],
        cc: [],
        bcc: [],
        subject: source.subject,
        attachments: [],
      },
    };
    await prisma.sourceRecord.create({
      data: {
        channel: SourceChannel.Email,
        tlp: source.tlp,
        externalId: source.externalId,
        contentHash: sourceContentHash(raw, source.markdown),
        raw,
        markdown: source.markdown,
        observedAt: new Date(source.receivedAt),
        links: {
          create: {
            notificationId,
            sourceType: "Link",
            reasonWhy: source.reasonWhy,
          },
        },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function getSeedUser() {
  return prisma.user.findUniqueOrThrow({
    where: { email: SEED_USER.email },
  });
}

async function main() {
  console.log("🚀 Seeding hospital notifications\n");

  const user = await getSeedUser();
  await seedSyngoPlazaVexScenario(user.id);
  await seedDeserializationScenario(user.id);
  await seedVendorCoverage();
  await seedQuestion();
  await seedMixedTlpSources();

  console.log("\n✨ Done.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
