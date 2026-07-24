import type { HospitalImpact } from "@/features/inbox/types";
import {
  type AssetStatus,
  ConfidenceLevel,
  IssueStatus,
  NotAffectedJustification,
  NotificationChannel,
  NotificationType,
  Priority,
  ScopeTargetModel,
  Severity,
  Tlp,
  VersionStatus,
} from "@/generated/prisma";
import prisma from "../src/lib/db";

const SEED_USER = {
  email: "user@example.com",
};

// ---------------------------------------------------------------------------
// Canonical entity helpers
// ---------------------------------------------------------------------------

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
// ---------------------------------------------------------------------------
// Siemens syngo.plaza VEX scenario (SSA-016040 / CVE-2024-52334)
// ---------------------------------------------------------------------------
//
// Exercises the vex agent's asset-level override path: the device group as a
// whole is affected by the CVE, but a Note on one specific asset gives the
// agent grounds to mark that asset NOT_AFFECTED while the sibling asset (and
// the group-level issue) stay AFFECTED.

const SYNGO_PLAZA = {
  vendor: "Siemens Healthineers",
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

async function seedSyngoPlazaVexScenario(userId: string) {
  console.log("\n🌱 Seeding Siemens syngo.plaza VEX scenario...");

  const vendor = await upsertVendor(SYNGO_PLAZA.vendor);
  const product = await upsertProduct(SYNGO_PLAZA.product);
  const version = await upsertVersion(SYNGO_PLAZA.version);

  const groupIdentity = {
    vendorId: vendor.id,
    productId: product.id,
    versionId: version.id,
    versionStatus: VersionStatus.KNOWN,
  };
  const deviceGroup =
    (await prisma.deviceGroup.findFirst({ where: groupIdentity })) ??
    (await prisma.deviceGroup.create({ data: groupIdentity }));

  const assets = await Promise.all(
    SYNGO_PLAZA_ASSETS.map(async (asset) => {
      const existing = await prisma.asset.findFirst({
        where: { serialNumber: asset.serialNumber },
      });
      if (existing) return existing;
      return prisma.asset.create({
        data: {
          ...asset,
          upstreamApi: "https://example.com/placeholder",
          status: "Active" as AssetStatus,
          deviceGroupId: deviceGroup.id,
          userId,
        },
      });
    }),
  );

  const matching =
    (await prisma.deviceGroupMatching.findFirst({
      where: {
        vendorId: vendor.id,
        productId: product.id,
        versionId: version.id,
        versionRange: null,
      },
    })) ??
    (await prisma.deviceGroupMatching.create({
      data: {
        vendorId: vendor.id,
        productId: product.id,
        versionId: version.id,
      },
    }));

  const vulnerability =
    (await prisma.vulnerability.findFirst({
      where: { cveId: "CVE-2024-52334" },
    })) ??
    (await prisma.vulnerability.create({
      data: {
        cveId: "CVE-2024-52334",
        severity: Severity.Medium,
        cvssScore: 5.3,
        cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
        description:
          "syngo.plaza VB30E contains an insecure password encryption vulnerability that could allow an attacker to extract original passwords and might gain unauthorized access.",
        narrative:
          "The affected application does not encrypt passwords properly. An attacker who can read the stored credential material can recover the original passwords and use them to authenticate as a legitimate user.",
        impact:
          "Unauthorized access to the syngo.plaza PACS system used to display, process, and report on diagnostic images, including mammography.",
        userId,
        sarif: {
          version: "2.1.0",
          runs: [
            {
              tool: { driver: { name: "Siemens Healthineers PSIRT" } },
              results: [
                {
                  ruleId: "CVE-2024-52334",
                  level: "warning",
                  message: {
                    text: "Insecure password encryption in syngo.plaza VB30E (SSA-016040)",
                  },
                },
              ],
            },
          ],
        },
        deviceGroupMatchings: { connect: { id: matching.id } },
      },
    }));

  const remediation =
    (await prisma.remediation.findFirst({
      where: {
        vulnerabilityId: vulnerability.id,
        description: REMEDIATION_TEXT,
      },
    })) ??
    (await prisma.remediation.create({
      data: {
        description: REMEDIATION_TEXT,
        narrative:
          "Siemens Healthineers has released hot fix HF07 for syngo.plaza VB30E. Apply the hot fix during the next maintenance window to remediate the insecure password encryption.",
        vulnerabilityId: vulnerability.id,
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
      tlp: Tlp.WHITE,
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

  await prisma.notificationSource.create({
    data: {
      notificationId: notification.id,
      channel: NotificationChannel.Email,
      sourceType: "Source",
      raw: {
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
      },
      markdown: `# SSA-016040: Insecure Password Encryption Vulnerability in syngo.plaza VB30E

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
- CWE-261: Weak Encoding for Password`,
      receivedAt: new Date(),
    },
  });

  await prisma.notificationVulnerabilityMapping.create({
    data: {
      notificationId: notification.id,
      vulnerabilityId: vulnerability.id,
      confidence: ConfidenceLevel.Confirmed,
      reasonWhy: "CVE-2024-52334 explicitly named in the vendor advisory.",
    },
  });

  await prisma.notificationDeviceGroupMapping.create({
    data: {
      notificationId: notification.id,
      deviceGroupMatchingId: matching.id,
      confidence: ConfidenceLevel.Confirmed,
      reasonWhy:
        "Vendor, product, and affected version range matched from the advisory's affected-products table.",
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

const DESERIALIZATION_VENDOR = "Siemens Healthineers";

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
  const vendor = await upsertVendor(DESERIALIZATION_VENDOR);
  const product = await upsertProduct(spec.product);
  const version = spec.version ? await upsertVersion(spec.version) : null;

  const where = {
    vendorId: vendor.id,
    productId: product.id,
    versionId: version?.id ?? null,
    versionRange: spec.versionRange ?? null,
  };

  return (
    (await prisma.deviceGroupMatching.findFirst({ where })) ??
    (await prisma.deviceGroupMatching.create({ data: where }))
  );
}

async function upsertDeviceGroupForAsset(
  product: string,
  version?: string,
  versionStatus: VersionStatus = version
    ? VersionStatus.KNOWN
    : VersionStatus.UNKNOWN,
) {
  const vendor = await upsertVendor(DESERIALIZATION_VENDOR);
  const productRec = await upsertProduct(product);
  const versionRec = version ? await upsertVersion(version) : null;

  const vendorId = vendor.id;
  const productId = productRec.id;
  const versionId = versionRec?.id ?? null;

  return (
    (await prisma.deviceGroup.findFirst({
      where: { vendorId, productId, versionId, versionStatus },
    })) ??
    (await prisma.deviceGroup.create({
      data: { vendorId, productId, versionId, versionStatus },
    }))
  );
}

async function seedDeserializationScenario(userId: string) {
  console.log("\n🌱 Seeding Siemens deserialization scenario...");

  // Sequential: several products share a canonical version (e.g. "VA30 SP5",
  // "VB22"), and concurrent upserts of the same Version race on its unique key.
  const matchings: Awaited<ReturnType<typeof upsertDeserializationMatching>>[] =
    [];
  for (const spec of DESERIALIZATION_MATCHINGS) {
    matchings.push(await upsertDeserializationMatching(spec));
  }

  const vulnerability =
    (await prisma.vulnerability.findFirst({
      where: { cveId: "CVE-2022-29875" },
    })) ??
    (await prisma.vulnerability.create({
      data: {
        cveId: "CVE-2022-29875",
        severity: Severity.Critical,
        cvssScore: 9.8,
        cvssVector:
          "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:C",
        description:
          "The application deserialises untrusted data without sufficient validations, which could result in an arbitrary deserialization. This could allow an unauthenticated attacker to execute code in the affected system if ports 32912/tcp or 32914/tcp are reachable.",
        narrative:
          "An unauthenticated attacker who can reach ports 32912/tcp or 32914/tcp on an affected system can send a crafted serialized payload. Because the application deserializes untrusted data without validation (CWE-502), the payload is instantiated and can execute arbitrary code under the syngo platform's privileges.",
        impact:
          "Remote code execution on imaging systems (MRI, CT, PET/CT, SPECT/CT, mammography) and the syngo.via viewing/reporting platform, potentially disrupting diagnostic imaging workflows across radiology and nuclear medicine.",
        userId,
        sarif: {
          version: "2.1.0",
          runs: [
            {
              tool: { driver: { name: "Siemens Healthineers PSIRT" } },
              results: [
                {
                  ruleId: "CVE-2022-29875",
                  level: "error",
                  message: {
                    text: "Deserialization of untrusted data in Siemens Healthineers syngo platform (SSA-220609)",
                  },
                },
              ],
            },
          ],
        },
        deviceGroupMatchings: {
          connect: matchings.map((m) => ({ id: m.id })),
        },
      },
    }));

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
    const deviceGroup = await upsertDeviceGroupForAsset(
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
          upstreamApi: "https://example.com/placeholder",
          status: "Active" as AssetStatus,
          deviceGroupId: deviceGroup.id,
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
      tlp: Tlp.WHITE,
      hospitalImpact: {
        byline:
          "Unauthenticated RCE across hospital-wide imaging infrastructure could halt diagnostic imaging and reporting.",
        impactStatement:
          "Affects imaging systems across radiology and nuclear medicine (MRI, CT, PET/CT, SPECT/CT, mammography) and syngo.via viewing/reporting workstations. Successful exploitation could disrupt diagnostic imaging and reporting workflows hospital-wide.",
        careAreas:
          "Radiology & Nuclear Medicine — MRI, CT, PET/CT, SPECT/CT, mammography, syngo.via reading/reporting",
        likelihood:
          "Unauthenticated network RCE (CVSS 9.8) · gated on reachability of ports 32912/tcp & 32914/tcp · vendor fixes available",
      } satisfies HospitalImpact,
      priorityReasonWhy:
        "Unauthenticated remote code execution (CVSS 9.8) on life-adjacent imaging infrastructure. Exploitability is gated on reachability of ports 32912/tcp and 32914/tcp — block them at the network boundary immediately and schedule the vendor fixes.",
    },
  });

  await prisma.notificationSource.create({
    data: {
      notificationId: notification.id,
      channel: NotificationChannel.Email,
      sourceType: "Source",
      raw: {
        type: "email.received",
        created_at: "2022-06-09T09:00:00.000Z",
        data: {
          email_id: "seed-ssa-220609",
          created_at: "2022-06-09T09:00:00.000Z",
          from: "psirt@siemens-healthineers.com",
          to: ["security@hospital.org"],
          cc: [],
          bcc: [],
          subject:
            "SSA-220609: Deserialization Vulnerability in Healthcare Products",
          attachments: [],
        },
      },
      markdown: `# SSA-220609: Deserialization Vulnerability in Healthcare Products

**Publication Date**: 2022-05-31 · **Last Update**: 2022-06-09 · **CVSS v3.1**: 9.8

## Summary
A deserialization vulnerability is present in syngo which could allow an unauthenticated attacker to perform remote code execution under certain circumstances. Multiple Siemens Healthineers products use this platform and are affected by varying degrees.

## Vulnerability classification (CVE-2022-29875)
The application deserialises untrusted data without sufficient validations that could result in an arbitrary deserialization. This could allow an unauthenticated attacker to execute code in the affected system if ports 32912/tcp or 32914/tcp are reachable.

- CVSS v3.1 Vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:C
- CWE-502: Deserialization of Untrusted Data

## Workarounds and mitigations
- If possible, block ports 32912/tcp and 32914/tcp on an external firewall.
- Product-specific fixes are available; contact your local Siemens Healthineers service representative.`,
      receivedAt: new Date(),
    },
  });

  await prisma.notificationVulnerabilityMapping.create({
    data: {
      notificationId: notification.id,
      vulnerabilityId: vulnerability.id,
      confidence: ConfidenceLevel.Confirmed,
      reasonWhy: "CVE-2022-29875 explicitly named in the vendor advisory.",
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
            "Vendor, product, and affected version(s) matched from the advisory's affected-products table.",
        },
      }),
    ),
  );

  console.log(`  ✅ Created: ${title}`);
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

  console.log("\n✨ Done.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
