import {
  ConfidenceLevel,
  NotificationType,
  PlatformEnum,
  Priority,
  ResourceType,
  SourceChannel,
  Tlp,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { SIEMENS_HEALTHINEERS } from "@/lib/manufacturer-catalog";
import { sourceContentHash } from "@/lib/source-hash";

// teamplay Fleet equipment ↔ VIPER asset, keyed by serial number — exactly what
// the Fleet /equipment sync (syncFleetEquipmentMappings) produces at runtime.
// equipmentKey format mirrors real Fleet records (e.g. "US_1064669350").
const SEED_FLEET_EQUIPMENT = [
  { serialNumber: "SH-MAG-2021-001", equipmentKey: "US_1064669350" },
  { serialNumber: "SH-SOM-2022-001", equipmentKey: "US_1012141299" },
];

/**
 * The Siemens Healthineers teamplay Fleet integration, plus the equipment
 * mappings that mark assets as Siemens-serviced.
 *
 * An ExternalAssetMapping to this integration is the ONLY thing that makes an
 * asset eligible for a Fleet work order (see fleet-client.ts). In production the
 * mappings come from the Fleet /equipment sync; here we seed the same rows so
 * the flow is demoable without Fleet credentials.
 */
export async function seedFleetIntegration(userId: string) {
  console.log("\n🌱 Seeding Siemens Healthineers Fleet integration...");

  const existing = await prisma.integration.findFirst({
    where: { platform: PlatformEnum.FLEET },
  });

  // Integrations own a service user — the creator of the tickets they ingest.
  const integrationUser =
    (await prisma.user.findFirst({
      where: { email: "fleet-integration@viper.local" },
    })) ??
    (await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: "fleet-integration@viper.local",
        name: "teamplay Fleet Integration",
        emailVerified: true,
      },
    }));

  const integration =
    existing ??
    (await prisma.integration.create({
      data: {
        name: "Siemens Healthineers teamplay Fleet",
        platform: PlatformEnum.FLEET,
        config: {},
        syncEvery: 3600,
        userId,
        integrationUserId: integrationUser.id,
        resourceSyncs: {
          create: [
            { resource: ResourceType.WorkOrder },
            { resource: ResourceType.Asset },
            { resource: ResourceType.SourceRecord },
          ],
        },
      },
    }));

  const allResourceTypes = [
    ResourceType.WorkOrder,
    ResourceType.Asset,
    ResourceType.SourceRecord,
  ];
  // A re-seed against an existing integration must still gain any sync rows
  // added since it was first created (e.g. Asset, VW-434).
  for (const resource of allResourceTypes) {
    await prisma.integrationResourceSync.upsert({
      where: {
        integrationId_resource: { integrationId: integration.id, resource },
      },
      create: { integrationId: integration.id, resource },
      update: {},
    });
  }

  let linked = 0;
  for (const equipment of SEED_FLEET_EQUIPMENT) {
    const asset = await prisma.asset.findFirst({
      where: { serialNumber: equipment.serialNumber },
    });
    if (!asset) {
      console.warn(
        `⚠️  No asset with serial ${equipment.serialNumber} — skipping Fleet mapping`,
      );
      continue;
    }

    await prisma.externalAssetMapping.upsert({
      where: {
        external_asset_mappings_item_integration_key: {
          itemId: asset.id,
          integrationId: integration.id,
        },
      },
      create: {
        itemId: asset.id,
        integrationId: integration.id,
        externalId: equipment.equipmentKey,
        lastSynced: new Date(),
      },
      update: { externalId: equipment.equipmentKey, lastSynced: new Date() },
    });
    linked++;
  }

  // In production connectUncontractedAssets() points the Siemens relationship at
  // the Fleet integration. That module is server-only and will not load here, so
  // the seed sets the same field directly. Without it every relationship has a
  // null workOrderIntegrationId, so resolveWorkOrderTargets() treats every asset
  // as unmanaged and no work order can be filed against seed data.
  const { count: managingRelationships } =
    await prisma.managesRelationship.updateMany({
      where: { vendor: { canonicalName: SIEMENS_HEALTHINEERS.canonicalName } },
      data: { workOrderIntegrationId: integration.id },
    });

  console.log(
    `✅ Seeded Fleet integration with ${linked} managed asset(s), ${managingRelationships} managing relationship(s)`,
  );
  return integration;
}

/**
 * The advisory the mitigate agent plans against.
 *
 * It names the two Siemens imaging systems the Fleet integration manages, so a
 * plan drafted from it resolves to a teamplay Fleet work order target. Without
 * a notification there is nothing for the agent to run on, and the whole
 * propose-then-file path is undemoable locally.
 *
 * The plans themselves are NOT seeded. They come from an Opus call that the
 * Inngest job makes, and a canned plan would hide a broken agent.
 */
const FLEET_ADVISORY_MARKDOWN = `# Siemens Healthineers Security Advisory SHSA-0000-000 (hypothetical)

**Affected products:** MAGNETOM Sola (MRI), SOMATOM go.Top (CT)
**CVE:** CVE-2023-00001
**Severity:** High (CVSS 7.8)

## Summary

The service interface on the affected imaging consoles does not correctly
restrict privileges. An unprivileged local account can escalate to
administrative rights on the scanner console.

## Remediation

Siemens Healthineers field service must apply firmware update VX00A-SP0. The
hospital holds no service credentials for these consoles, so the update cannot
be applied locally. Raise a service request through your teamplay Fleet
contract.

## Workaround

Until the update is applied, restrict console logins to named technologist
accounts and review the local account list on each system.
`;

export async function seedFleetAdvisoryNotification() {
  console.log("\n🌱 Seeding the Siemens advisory notification...");

  const vulnerability = await prisma.vulnerability.findFirst({
    where: { cveId: "CVE-2023-00001" },
    select: { id: true, deviceGroupMatchings: { select: { id: true } } },
  });
  if (!vulnerability) {
    console.warn("⚠️  CVE-2023-00001 not seeded — skipping the advisory");
    return;
  }

  const raw = { advisoryId: "SHSA-0000-000 (hypothetical)" };

  // Rebuilt rather than upserted, as seedVendors does: a Notification has no
  // natural unique key, so a re-seed without SEED_CLEAR_DB would stack a fresh
  // advisory every run. The delete cascades its source record and its mappings.
  await prisma.notification.deleteMany({
    where: {
      sourceLinks: { some: { sourceRecord: { raw: { equals: raw } } } },
    },
  });

  await prisma.notification.create({
    data: {
      type: NotificationType.Advisory,
      title:
        "Siemens Healthineers advisory: privilege escalation on MAGNETOM and SOMATOM consoles",
      summary:
        "Siemens reports a privilege escalation on the MAGNETOM Sola and SOMATOM go.Top service interface. Their field service must apply the firmware update under the teamplay Fleet contract.",
      priority: Priority.High,
      priorityReasonWhy:
        "Two single-unit imaging systems, and the fix needs a vendor visit rather than a local patch.",
      hospitalImpact: {
        byline: "Both radiology scanners need a Siemens service visit",
        impactStatement:
          "The MAGNETOM Sola and SOMATOM go.Top each need a firmware update only Siemens can apply. Each visit takes the scanner out of service for its duration.",
        careAreas: "Radiology, Emergency",
        likelihood:
          "Exploitation needs a local console account, so the risk is insider or physical access rather than remote attack.",
      },
      vulnerabilities: {
        create: {
          vulnerabilityId: vulnerability.id,
          confidence: ConfidenceLevel.Matched,
          reasonWhy: "The advisory names this CVE directly.",
        },
      },
      deviceGroupsMatchings: {
        create: vulnerability.deviceGroupMatchings.map((matching) => ({
          deviceGroupMatchingId: matching.id,
          confidence: ConfidenceLevel.Matched,
          reasonWhy: "The advisory names this make and model.",
        })),
      },
      sourceLinks: {
        create: {
          sourceRecord: {
            create: {
              channel: SourceChannel.Email,
              tlp: Tlp.AMBER,
              raw,
              markdown: FLEET_ADVISORY_MARKDOWN,
              contentHash: sourceContentHash(raw, FLEET_ADVISORY_MARKDOWN),
            },
          },
        },
      },
    },
  });

  console.log(
    `✅ Seeded advisory notification covering ${vulnerability.deviceGroupMatchings.length} device group matching(s)`,
  );
}
