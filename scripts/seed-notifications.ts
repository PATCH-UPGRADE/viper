import {
  type AssetStatus,
  ConfidenceLevel,
  NotificationChannel,
  NotificationType,
  Priority,
  Tlp,
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
  hospitalImpact: string;
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
    hospitalImpact:
      "Affects 8 ICU patient monitors. Alarm suppression or threshold manipulation could delay nurse response to life-threatening events.",
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
    hospitalImpact:
      "14 infusion pumps in pharmacy and patient floors. Unexpected device resets during active infusion could interrupt vasoactive drips or antibiotic delivery.",
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
    hospitalImpact:
      "6 medication dispensing cabinets across nursing stations. Path traversal could allow authorized users to access configuration files outside their permission scope.",
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
    hospitalImpact:
      "4 anesthesia workstations in OR suites. Exposure limited to OR network segment — clinical staff with network access could query case parameters without authentication.",
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
    hospitalImpact:
      "Affects waveform data confidentiality for all monitored patients. Not life-safety, but represents a HIPAA compliance gap if not addressed.",
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
    hospitalImpact:
      "14 affected pumps will become unsupported. Post-EOS vulnerabilities will not be patched by vendor. Include in capital equipment budget cycle.",
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
    hospitalImpact:
      "No immediate clinical or security impact. Compliance housekeeping. Failure to archive could result in audit findings during DEA or Joint Commission inspection.",
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
    hospitalImpact:
      "No security impact. OR scheduling team should evaluate interoperability improvements before next planned OR downtime.",
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
    hospitalImpact: "Unknown. Flagged for security team review.",
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
    hospitalImpact:
      "Potential impact scope unclear — awaiting vendor confirmation from Philips, GE, BD, and Draeger. No confirmed exploitation in medical device context.",
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

  console.log("\n✨ Done.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
