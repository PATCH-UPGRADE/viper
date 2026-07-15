import type { HospitalImpact } from "@/features/inbox/types";
import {
  type AssetStatus,
  ConfidenceLevel,
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
// Device groups + assets
// ---------------------------------------------------------------------------

const DEVICE_GROUPS = [
  {
    vendor: "Philips",
    product: "IntelliVue MX800 Patient Monitor",
    assetCount: 8,
    assetRole: "Patient Monitor",
    networkSegment: "ICU-MONITORS",
  },
  {
    vendor: "GE HealthCare",
    product: "Alaris 8015 PC Unit Infusion Pump",
    assetCount: 14,
    assetRole: "Infusion Pump",
    networkSegment: "PHARMACY-PUMPS",
  },
  {
    vendor: "BD",
    product: "Pyxis MedStation 4000 ES",
    assetCount: 6,
    assetRole: "Medication Dispenser",
    networkSegment: "NURSING-STATIONS",
  },
  {
    vendor: "Draeger",
    product: "Perseus A500 Anesthesia Workstation",
    assetCount: 4,
    assetRole: "Anesthesia Workstation",
    networkSegment: "OR-SUITE",
  },
];

async function seedDeviceGroups(userId: string) {
  console.log("\n🌱 Seeding device groups and assets...");
  const results = [];

  for (const dg of DEVICE_GROUPS) {
    const vendor = await upsertVendor(dg.vendor);
    const product = await upsertProduct(dg.product);

    const identity = { vendorId: vendor.id, productId: product.id };
    const existing = await prisma.deviceGroup.findFirst({ where: identity });
    const deviceGroup =
      existing ?? (await prisma.deviceGroup.create({ data: identity }));
    const existingMatching = await prisma.deviceGroupMatching.findFirst({
      where: { vendorId: vendor.id, productId: product.id, versionId: null },
    });
    const deviceGroupMatching =
      existingMatching ??
      (await prisma.deviceGroupMatching.create({ data: identity }));
    const existingAssets = await prisma.asset.count({
      where: { deviceGroupId: deviceGroup.id },
    });

    if (existingAssets < dg.assetCount) {
      const toCreate = dg.assetCount - existingAssets;
      const assets = Array.from({ length: toCreate }).map((_, i) => ({
        ip: `10.${DEVICE_GROUPS.indexOf(dg) + 1}.0.${existingAssets + i + 1}`,
        role: dg.assetRole,
        networkSegment: dg.networkSegment,
        hostname: `${dg.assetRole.toLowerCase().replace(/\s+/g, "-")}-${String(existingAssets + i + 1).padStart(2, "0")}`,
        upstreamApi: "https://example.com/placeholder",
        status: "Active" as AssetStatus,
        deviceGroupId: deviceGroup.id,
        userId,
      }));
      await prisma.asset.createMany({ data: assets, skipDuplicates: true });
    }

    console.log(
      `  ✅ ${dg.vendor} ${dg.product} (${deviceGroup.id}) — ${dg.assetCount} assets`,
    );
    results.push({
      ...dg,
      deviceGroupId: deviceGroup.id,
      deviceGroupMatchingId: deviceGroupMatching.id,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Notification seed data
// ---------------------------------------------------------------------------

type NotificationSeed = {
  title: string;
  summary: string;
  type: NotificationType;
  priority: Priority;
  tlp: Tlp | null;
  hospitalImpact: HospitalImpact;
  priorityReasonWhy: string;
  deviceGroupIndices: number[];
  sources: Array<{
    from: string;
    subject: string;
  }>;
};

const NOTIFICATIONS: NotificationSeed[] = [
  {
    title: "Philips IntelliVue MX800 — Hard-Coded Credentials (CVE-2023-40539)",
    summary:
      "Philips has disclosed a critical vulnerability in the IntelliVue MX800 patient monitor series. Hard-coded service credentials allow unauthenticated access to clinical configuration interfaces over the hospital network, enabling silent modification of alarm thresholds and waveform display settings.",
    type: NotificationType.Advisory,
    priority: Priority.Critical,
    tlp: Tlp.AMBER,
    hospitalImpact: {
      byline:
        "Alarm tampering on 8 ICU patient monitors could delay nurse response to life-threatening events.",
      impactStatement:
        "Affects 8 ICU patient monitors. Alarm suppression or threshold manipulation could delay nurse response to life-threatening events.",
      careAreas: "ICU — Patient Monitoring",
      likelihood: "Unauthenticated network access · hard-coded credentials",
    },
    priorityReasonWhy:
      "Network-accessible, no authentication required, directly impacts life-safety alarms in ICU. Immediate containment recommended.",
    deviceGroupIndices: [0],
    sources: [
      {
        from: "psirt@philips.com",
        subject:
          "Security Advisory: IntelliVue MX800 Hard-Coded Credentials — CVE-2023-40539",
      },
      {
        from: "alerts@cisa.gov",
        subject: "ICS-CERT Alert: Philips IntelliVue Vulnerability Disclosure",
      },
    ],
  },
  {
    title: "GE Alaris 8015 PC Unit — Firmware Recall Notice",
    summary:
      "GE HealthCare has issued a Class II Device Recall for the Alaris 8015 PC Unit running firmware versions 11.1.2 through 11.1.5. A buffer overflow in the drug library parser can cause device resets during infusion, potentially interrupting critical IV medication delivery.",
    type: NotificationType.Recall,
    priority: Priority.Critical,
    tlp: Tlp.GREEN,
    hospitalImpact: {
      byline:
        "Device resets on 14 infusion pumps could interrupt critical IV medication delivery.",
      impactStatement:
        "14 infusion pumps in pharmacy and patient floors. Unexpected device resets during active infusion could interrupt vasoactive drips or antibiotic delivery.",
      careAreas: "Pharmacy, Patient Floors — Infusion Pumps",
      likelihood: "FDA Class II recall · documented field failures",
    },
    priorityReasonWhy:
      "FDA Class II recall with documented field failures. Direct patient safety impact. Firmware update required before continued clinical use.",
    deviceGroupIndices: [1],
    sources: [
      {
        from: "recall-notifications@gehealthcare.com",
        subject: "URGENT: Class II Recall — Alaris 8015 Firmware 11.1.2–11.1.5",
      },
    ],
  },
  {
    title: "BD Pyxis MedStation 4000 ES — Firmware Update 1.8.2",
    summary:
      "BD has released firmware update 1.8.2 for the Pyxis MedStation 4000 ES, addressing two moderate-severity vulnerabilities: an authenticated path traversal (CVE-2024-11923) and an insecure TLS downgrade (CVE-2024-11924). The update also improves controlled substance audit log tamper detection.",
    type: NotificationType.UpdateAvailable,
    priority: Priority.High,
    tlp: Tlp.GREEN,
    hospitalImpact: {
      byline:
        "Path traversal on 6 medication dispensing cabinets could expose configuration outside permission scope.",
      impactStatement:
        "6 medication dispensing cabinets across nursing stations. Path traversal could allow authorized users to access configuration files outside their permission scope.",
      careAreas: "Nursing Stations — Medication Dispensing",
      likelihood: "Authenticated access required · no active exploitation",
    },
    priorityReasonWhy:
      "Not actively exploited, but the audit log improvement is important for DEA compliance. Schedule update in next maintenance window.",
    deviceGroupIndices: [2],
    sources: [
      {
        from: "security@bd.com",
        subject: "Pyxis MedStation 4000 ES — Firmware 1.8.2 Security Update",
      },
    ],
  },
  {
    title:
      "Draeger Perseus A500 — Unencrypted Service Port Exposed on OR Network",
    summary:
      "Security research published by MedSec has identified that Draeger Perseus A500 anesthesia workstations expose a legacy service port (TCP 7788) without TLS when connected to a flat OR network segment. The port accepts unauthenticated read queries for device configuration and recent case parameters.",
    type: NotificationType.Advisory,
    priority: Priority.High,
    tlp: Tlp.AMBER,
    hospitalImpact: {
      byline:
        "An exposed service port on 4 OR anesthesia workstations could leak case parameters.",
      impactStatement:
        "4 anesthesia workstations in OR suites. Exposure limited to OR network segment — clinical staff with network access could query case parameters without authentication.",
      careAreas: "Operating Rooms — Anesthesia Workstations",
      likelihood: "Unauthenticated read on OR segment · vendor patch pending",
    },
    priorityReasonWhy:
      "Not remotely exploitable from outside OR segment. Draeger patch pending (Q2 2025). Recommend network segmentation of OR VLAN as interim mitigation.",
    deviceGroupIndices: [3],
    sources: [
      {
        from: "notifications@medsec-research.io",
        subject:
          "Research Disclosure: Draeger Perseus A500 Service Port Exposure",
      },
      {
        from: "psirt@draeger.com",
        subject:
          "Re: Perseus A500 TCP 7788 — Vendor Statement and Patch Timeline",
      },
    ],
  },
  {
    title: "Philips IntelliVue — TLS Certificate Expiry Warning (30 days)",
    summary:
      "The TLS certificates used for IntelliVue waveform streaming to the central monitoring station are expiring in 30 days. After expiry, encrypted data channels will fall back to unencrypted transmission per device default configuration, exposing real-time patient waveform data on the network.",
    type: NotificationType.Advisory,
    priority: Priority.Monitor,
    tlp: null,
    hospitalImpact: {
      byline:
        "Expiring TLS certificates could expose patient waveform data on the network.",
      impactStatement:
        "Affects waveform data confidentiality for all monitored patients. Not life-safety, but represents a HIPAA compliance gap if not addressed.",
      careAreas: "ICU — Patient Monitoring / Central Station",
      likelihood: "Confidentiality risk on expiry · 30-day lead time",
    },
    priorityReasonWhy:
      "Certificate renewal is routine maintenance. 30 days is sufficient lead time. Monitor to ensure renewal is completed.",
    deviceGroupIndices: [0],
    sources: [
      {
        from: "alerts@philips-monitoring.com",
        subject:
          "⚠️ TLS Certificate Expiry Alert — IntelliVue Streaming (30 days)",
      },
    ],
  },
  {
    title: "GE Alaris — End of Software Support Notice (December 2025)",
    summary:
      "GE HealthCare has announced that software support for the Alaris 8015 PC Unit Series 1 will end on December 31, 2025. After this date, no security patches or bug fixes will be issued. Customers should begin planning migration to the Alaris 35 series or equivalent alternative.",
    type: NotificationType.Other,
    priority: Priority.Monitor,
    tlp: Tlp.WHITE,
    hospitalImpact: {
      byline:
        "14 infusion pumps lose vendor security support after December 2025.",
      impactStatement:
        "14 affected pumps will become unsupported. Post-EOS vulnerabilities will not be patched by vendor. Include in capital equipment budget cycle.",
      careAreas: "Pharmacy, Patient Floors — Infusion Pumps",
      likelihood: "No active exploit · end-of-support planning item",
    },
    priorityReasonWhy:
      "Not immediately actionable — 12+ months until EOS. Flag for capital planning and biomedical engineering roadmap.",
    deviceGroupIndices: [1],
    sources: [
      {
        from: "customer-success@gehealthcare.com",
        subject:
          "Important: Alaris 8015 Series 1 End of Software Support — December 2025",
      },
    ],
  },
  {
    title: "BD Pyxis — Routine HIPAA Audit Log Archival Reminder",
    summary:
      "Quarterly reminder from BD to archive and verify controlled substance audit logs from Pyxis MedStation units per 21 CFR Part 11 requirements. Logs older than 90 days should be exported and stored in a HIPAA-compliant archive before the device log buffer overwrites them.",
    type: NotificationType.Other,
    priority: Priority.Defer,
    tlp: null,
    hospitalImpact: {
      byline:
        "Routine controlled-substance audit-log archival to stay compliant.",
      impactStatement:
        "No immediate clinical or security impact. Compliance housekeeping. Failure to archive could result in audit findings during DEA or Joint Commission inspection.",
      careAreas: "Pharmacy — Medication Dispensing",
      likelihood: "No vulnerability · compliance housekeeping",
    },
    priorityReasonWhy:
      "Routine compliance task. No vulnerability. Defer to pharmacy informatics team.",
    deviceGroupIndices: [2],
    sources: [
      {
        from: "compliance@bd.com",
        subject: "Quarterly Reminder: Pyxis Audit Log Archival — Q2 2025",
      },
    ],
  },
  {
    title:
      "Draeger — Software Release Notes: OR Suite Device Integration Update",
    summary:
      "Draeger has published release notes for a non-security software update to the Perseus A500 integration module, adding improved OR scheduling system interoperability and updated IHE PCD profiles. No security relevance identified. Review for compatibility with your OR management system before deployment.",
    type: NotificationType.UpdateAvailable,
    priority: Priority.Defer,
    tlp: Tlp.WHITE,
    hospitalImpact: {
      byline:
        "Non-security OR integration update for evaluation before deployment.",
      impactStatement:
        "No security impact. OR scheduling team should evaluate interoperability improvements before next planned OR downtime.",
      careAreas: "Operating Rooms — Anesthesia Workstations",
      likelihood: "No security impact · interoperability update",
    },
    priorityReasonWhy:
      "Non-security update. No urgency. Defer to OR systems team for evaluation during next scheduled maintenance window.",
    deviceGroupIndices: [3],
    sources: [
      {
        from: "releases@draeger.com",
        subject: "Perseus A500 — Software Update v2.3.1 Release Notes",
      },
    ],
  },
  {
    title: "Unknown Vendor Email: Possible Phishing — Medical Device Offer",
    summary:
      "An unsolicited email was received from an unknown sender claiming to offer a firmware update for unspecified medical devices. The email contains a suspicious link and was flagged by the email security gateway. This notification was created for triage.",
    type: NotificationType.Other,
    priority: Priority.Unsorted,
    tlp: null,
    hospitalImpact: {
      byline: "Suspected phishing email flagged for security-team review.",
      impactStatement: "Unknown. Flagged for security team review.",
      careAreas: "",
      likelihood: "Unverified sender · possible phishing",
    },
    priorityReasonWhy:
      "Cannot assess priority until email content is reviewed and sender verified. Marked Unsorted pending triage.",
    deviceGroupIndices: [],
    sources: [
      {
        from: "updates@med-device-security-alerts.net",
        subject:
          "URGENT: Critical Firmware Update Required for Your Medical Devices",
      },
    ],
  },
  {
    title:
      "Multi-Vendor Advisory: OpenSSL 3.x Vulnerability Affects Medical Device Middleware (CVE-2024-5535)",
    summary:
      "OpenSSL 3.x versions prior to 3.3.2 contain a vulnerability in SSL_select_next_proto that can cause out-of-bounds memory reads in applications using ALPN callback functions. Multiple medical device vendors use OpenSSL in middleware components. Cross-reference with your device inventory and contact vendors for patch timelines.",
    type: NotificationType.Advisory,
    priority: Priority.Unsorted,
    tlp: Tlp.GREEN,
    hospitalImpact: {
      byline:
        "An OpenSSL flaw may affect medical-device middleware across four vendors — impact unconfirmed.",
      impactStatement:
        "Potential impact scope unclear — awaiting vendor confirmation from Philips, GE, BD, and Draeger. No confirmed exploitation in medical device context.",
      careAreas: "ICU, Pharmacy, Nursing Stations, Operating Rooms",
      likelihood: "Vendor impact unconfirmed · no medical-device exploitation",
    },
    priorityReasonWhy:
      "Vendor impact not yet confirmed. Priority set to Unsorted until vendor advisories are received and device inventory cross-referenced.",
    deviceGroupIndices: [0, 1, 2, 3],
    sources: [
      {
        from: "advisories@openssl.org",
        subject:
          "OpenSSL Security Advisory: CVE-2024-5535 — SSL_select_next_proto",
      },
      {
        from: "psirt@philips.com",
        subject: "Re: CVE-2024-5535 — IntelliVue Impact Assessment (Pending)",
      },
    ],
  },
];

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

  // TODO: matching fn for something like  "vers:generic/<VB30E_HF07"
  const versionRange = `vers:generic/${version.canonicalName}`;
  const matching =
    (await prisma.deviceGroupMatching.findFirst({
      where: {
        vendorId: vendor.id,
        productId: product.id,
        versionId: null,
        versionRange,
      },
    })) ??
    (await prisma.deviceGroupMatching.create({
      data: { vendorId: vendor.id, productId: product.id, versionRange },
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
          "Recoverable stored passwords on 2 PACS workstations could grant unauthorized access.",
        impactStatement:
          "Affects 2 syngo.plaza PACS workstations running pre-hotfix VB30E. If exploited, an attacker with access to stored credential material could recover passwords and gain unauthorized access to the PACS system.",
        careAreas: "Radiology — PACS Workstations",
        likelihood: "Requires access to stored credentials · hot fix available",
      },
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
        from: "psirt@siemens-healthineers.com",
        subject:
          "SSA-016040: Insecure Password Encryption Vulnerability in syngo.plaza VB30E",
        to: "security@hospital.org",
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
// Main seed function
// ---------------------------------------------------------------------------

async function getSeedUser() {
  return prisma.user.findUniqueOrThrow({
    where: { email: SEED_USER.email },
  });
}

async function seedNotifications(
  _userId: string,
  deviceGroups: Array<{ deviceGroupMatchingId: string }>,
) {
  console.log("\n🌱 Seeding notifications...");

  for (const seed of NOTIFICATIONS) {
    const existing = await prisma.notification.findFirst({
      where: { title: seed.title },
    });

    if (existing) {
      console.log(`  ⏭️  Already exists: ${seed.title}`);
      continue;
    }

    const notification = await prisma.notification.create({
      data: {
        title: seed.title,
        summary: seed.summary,
        type: seed.type,
        priority: seed.priority,
        tlp: seed.tlp,
        hospitalImpact: seed.hospitalImpact,
        priorityReasonWhy: seed.priorityReasonWhy,
      },
    });

    // Create sources
    for (const source of seed.sources) {
      await prisma.notificationSource.create({
        data: {
          notificationId: notification.id,
          channel: NotificationChannel.Email,
          sourceType: "Source",
          raw: {
            from: source.from,
            subject: source.subject,
            to: "security@hospital.org",
          },
          receivedAt: new Date(
            Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
          ),
        },
      });
    }

    // Create device group mappings
    for (const idx of seed.deviceGroupIndices) {
      const dg = deviceGroups[idx];
      if (!dg) continue;
      await prisma.notificationDeviceGroupMapping.create({
        data: {
          notificationId: notification.id,
          deviceGroupMatchingId: dg.deviceGroupMatchingId,
          confidence:
            Math.random() > 0.3
              ? ConfidenceLevel.Confirmed
              : ConfidenceLevel.Matched,
          reasonWhy:
            "Matched by vendor and product name from notification content.",
        },
      });
    }

    console.log(`  ✅ Created: ${seed.title}`);
  }
}

async function main() {
  console.log("🚀 Seeding hospital notifications\n");

  const user = await getSeedUser();
  const deviceGroups = await seedDeviceGroups(user.id);
  await seedNotifications(user.id, deviceGroups);
  await seedSyngoPlazaVexScenario(user.id);

  console.log("\n✨ Done.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
