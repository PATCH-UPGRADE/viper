// Seeds CSAF advisories that match the hospital `npm run seed` already built.
import type { CsafDocument } from "@/features/integrations/platforms/csaf/document";
import { csafDocumentSchema } from "@/features/integrations/platforms/csaf/document";
import { toMarkdown } from "@/features/integrations/platforms/csaf/markdown";
import {
  ConfidenceLevel,
  NotificationType,
  PlatformEnum,
  Priority,
  type Prisma,
  ResourceType,
  SourceChannel,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { sourceContentHash } from "@/lib/source-hash";
import { parseTlp } from "@/lib/tlp";

const SEED_USER_EMAIL = "user@example.com";
const INTEGRATION_USER_EMAIL = "csaf-integration@viper.local";
const CISA_PROVIDER_METADATA_URL =
  "https://www.cisa.gov/sites/default/files/csaf/provider-metadata.json";

const CISA = { name: "CISA", namespace: "https://www.cisa.gov" };

/** What the hospital-facing notification says, which CSAF itself has no field for. */
interface AdvisoryCopy {
  title: string;
  summary: string;
  /**
   * Stated per advisory rather than read off the Vulnerability row. Triage
   * moves `Vulnerability.priority` as the hospital works the queue, so taking
   * it from there makes a re-seed non-deterministic — it produced a `Defer`
   * notification for the CVSS 9.8 GE advisory on a worked-through database.
   */
  priority: Priority;
  priorityReasonWhy: string;
  hospitalImpact: {
    byline: string;
    impactStatement: string;
    careAreas: string;
    likelihood: string;
  };
}

interface AdvisoryFixture {
  /** Parsed by the platform's own schema before anything is written. */
  doc: unknown;
  /** Must already exist in `SAMPLE_VULNERABILITIES`, or the advisory is skipped. */
  cveId: string;
  copy: AdvisoryCopy;
}

// ── ICSMA-26-016-01: Baxter Sigma Spectrum ───────────────────────────────────
// One device group, 23 assets. The narrowest advisory in the set, and the one
// that drives the existing "Update Baxter Infusion Pumps Firmware" ticket.
const BAXTER: AdvisoryFixture = {
  cveId: "CVE-2021-12345",
  doc: {
    document: {
      title: "Baxter Sigma Spectrum Infusion Pump",
      publisher: CISA,
      distribution: { tlp: { label: "TLP:CLEAR" } },
      tracking: {
        id: "ICSMA-26-016-01",
        version: "1",
        status: "final",
        current_release_date: "2026-01-16T12:00:00.000Z",
      },
      notes: [
        {
          category: "summary",
          title: "Summary",
          text: "Successful exploitation of this vulnerability could allow an attacker on the same wireless segment to crash an infusion pump or execute code in its control context, interrupting medication delivery.",
        },
        {
          category: "other",
          title: "Risk Evaluation",
          text: "Baxter Sigma Spectrum infusion pumps running firmware prior to 8.00.01 contain a buffer overflow in the wireless management interface. The attacker must be on the same wireless segment as the pump; no authentication is required.",
        },
        {
          category: "other",
          title: "Critical Infrastructure Sectors",
          text: "Healthcare and Public Health",
        },
      ],
      references: [
        {
          category: "self",
          summary: "ICSMA-26-016-01 JSON",
          url: "https://www.cisa.gov/sites/default/files/csaf/icsma-26-016-01.json",
        },
        {
          category: "self",
          summary: "ICSMA-26-016-01 Web Version",
          url: "https://www.cisa.gov/news-events/ics-medical-advisories/icsma-26-016-01",
        },
      ],
    },
    product_tree: {
      branches: [
        {
          category: "vendor",
          name: "Baxter",
          branches: [
            {
              category: "product_name",
              name: "Sigma Spectrum",
              branches: [
                {
                  category: "product_version_range",
                  name: "vers:generic/<8.00.01",
                  product: {
                    product_id: "CSAFPID-0001",
                    name: "Baxter Sigma Spectrum (firmware before 8.00.01)",
                  },
                },
                {
                  category: "product_version",
                  name: "8.00.01",
                  product: {
                    product_id: "CSAFPID-0002",
                    name: "Baxter Sigma Spectrum 8.00.01",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    vulnerabilities: [
      {
        cve: "CVE-2021-12345",
        cwe: {
          id: "CWE-120",
          name: "Buffer Copy without Checking Size of Input ('Classic Buffer Overflow')",
        },
        notes: [
          {
            category: "summary",
            text: "The wireless management interface copies an attacker-supplied management frame into a fixed-size buffer without checking its length, allowing a crash or code execution in the pump's control context.",
          },
        ],
        product_status: {
          known_affected: ["CSAFPID-0001"],
          fixed: ["CSAFPID-0002"],
        },
        remediations: [
          {
            category: "vendor_fix",
            details:
              "Baxter has released firmware 8.00.01. Each pump must be taken out of service, updated, and clinically validated before returning to patient use.",
            product_ids: ["CSAFPID-0001"],
            url: "https://www.baxter.com/product-security",
          },
          {
            category: "mitigation",
            details:
              "Until the firmware is applied, restrict the pump wireless segment to known management hosts and monitor for unexpected management frames.",
            product_ids: ["CSAFPID-0001"],
          },
        ],
        scores: [
          {
            cvss_v3: {
              baseScore: 8.1,
              baseSeverity: "HIGH",
              vectorString: "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
            },
            products: ["CSAFPID-0001"],
          },
        ],
      },
    ],
  },
  copy: {
    title:
      "CISA advisory: buffer overflow in the Baxter Sigma Spectrum wireless management interface",
    summary:
      "CISA reports an unauthenticated buffer overflow in the Baxter Sigma Spectrum wireless management interface. Baxter has firmware 8.00.01; every pump has to come out of service to take it.",
    priority: Priority.High,
    priorityReasonWhy:
      "The whole medical-surgical pump fleet runs the affected firmware, and the fix is per-pump rather than fleet-wide.",
    hospitalImpact: {
      byline:
        "The medical-surgical infusion fleet needs a per-pump firmware visit",
      impactStatement:
        "Every Sigma Spectrum pump on WARD-VLAN-20 is on the affected firmware. Each one has to be taken off the floor, updated, and clinically validated, so the ward loses pumps a few at a time across the rollout rather than all at once.",
      careAreas: "Medical-Surgical, Oncology",
      likelihood:
        "Exploitation needs wireless adjacency to the ward segment, not internet access — so the realistic path is an attacker already inside the building or on the guest wireless.",
    },
  },
};

// ── ICSMA-26-030-01: GE Healthcare imaging ───────────────────────────────────
// Three device groups from one advisory, which is what exercises the
// multi-matching fan-out on the notification.
const GE_HEALTHCARE: AdvisoryFixture = {
  cveId: "CVE-2020-25175",
  doc: {
    document: {
      title: "GE Healthcare Imaging and Ultrasound Products",
      publisher: CISA,
      distribution: { tlp: { label: "TLP:GREEN" } },
      tracking: {
        id: "ICSMA-26-030-01",
        version: "2",
        status: "final",
        current_release_date: "2026-01-30T12:00:00.000Z",
      },
      notes: [
        {
          category: "summary",
          title: "Summary",
          text: "Successful exploitation of this vulnerability could allow an attacker with access to the imaging network to intercept service credentials and gain unauthorized access to device configuration interfaces.",
        },
        {
          category: "other",
          title: "Risk Evaluation",
          text: "Several GE Healthcare imaging and ultrasound products transmit service credentials with insufficient protection during normal network operation. An attacker on the same network segment can recover them passively.",
        },
        {
          category: "other",
          title: "Critical Infrastructure Sectors",
          text: "Healthcare and Public Health",
        },
      ],
      references: [
        {
          category: "self",
          summary: "ICSMA-26-030-01 JSON",
          url: "https://www.cisa.gov/sites/default/files/csaf/icsma-26-030-01.json",
        },
        {
          category: "self",
          summary: "ICSMA-26-030-01 Web Version",
          url: "https://www.cisa.gov/news-events/ics-medical-advisories/icsma-26-030-01",
        },
        {
          category: "external",
          summary: "GE Healthcare Product Security Bulletin GE-2020-004",
          url: "https://www.gehealthcare.com/security",
        },
      ],
    },
    product_tree: {
      branches: [
        {
          category: "vendor",
          name: "GE Healthcare",
          branches: [
            {
              category: "product_name",
              name: "BrightSpeed Elite Select",
              product: {
                product_id: "CSAFPID-0101",
                name: "GE Healthcare BrightSpeed Elite Select",
              },
            },
            {
              category: "product_name",
              name: "LOGIQ e",
              product: {
                product_id: "CSAFPID-0102",
                name: "GE Healthcare LOGIQ e R7",
              },
            },
            {
              category: "product_name",
              name: "Optima XR200amx",
              product: {
                product_id: "CSAFPID-0103",
                name: "GE Healthcare Optima XR200amx",
              },
            },
          ],
        },
      ],
    },
    vulnerabilities: [
      {
        cve: "CVE-2020-25175",
        cwe: {
          id: "CWE-523",
          name: "Unprotected Transport of Credentials",
        },
        notes: [
          {
            category: "summary",
            text: "Service credentials are transmitted across the network with insufficient protection, so anyone able to observe traffic on the imaging VLAN can recover them and reach the device configuration interface.",
          },
        ],
        product_status: {
          known_affected: ["CSAFPID-0101", "CSAFPID-0102", "CSAFPID-0103"],
        },
        remediations: [
          {
            category: "mitigation",
            details:
              "Isolate the affected devices on a dedicated imaging VLAN and restrict service access to known management hosts until the vendor firmware update can be scheduled.",
            product_ids: ["CSAFPID-0101", "CSAFPID-0102", "CSAFPID-0103"],
          },
          {
            category: "vendor_fix",
            details:
              "GE Healthcare supplies the firmware update through field service under the existing service contract.",
            product_ids: ["CSAFPID-0101", "CSAFPID-0102", "CSAFPID-0103"],
            url: "https://www.gehealthcare.com/security",
          },
        ],
        scores: [
          {
            cvss_v3: {
              baseScore: 9.8,
              baseSeverity: "CRITICAL",
              vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
            },
            products: ["CSAFPID-0101", "CSAFPID-0102", "CSAFPID-0103"],
          },
        ],
      },
    ],
  },
  copy: {
    title:
      "CISA advisory: credential exposure across GE Healthcare imaging and ultrasound products",
    summary:
      "CISA reports that several GE imaging products transmit service credentials without adequate protection. The CT scanner, the portable ultrasound units and the portable X-ray are all named.",
    priority: Priority.Critical,
    priorityReasonWhy:
      "Unauthenticated, network-reachable, and it lands on three different device groups sharing the imaging VLAN with PACS.",
    hospitalImpact: {
      byline: "Three imaging device groups share one exposed credential path",
      impactStatement:
        "The BrightSpeed Elite Select, the LOGIQ e R7 ultrasounds and the Optima XR200amx all sit on the imaging VLAN alongside PACS. Recovered service credentials would let an attacker alter imaging protocols or disable a device mid-study, and the VLAN gives onward reach to the reading workstations.",
      careAreas: "Radiology, Emergency, Critical Care",
      likelihood:
        "No authentication and no user interaction are needed — only traffic visibility on the imaging VLAN, which any compromised workstation on that segment already has.",
    },
  },
};

// ── ICSA-26-042-01: Cisco ASA ────────────────────────────────────────────────
// Not a medical advisory. Here so the set covers the network side of the
// inventory, and so one advisory in the seed carries a restrictive TLP.
const CISCO_ASA: AdvisoryFixture = {
  cveId: "CVE-2016-6366",
  doc: {
    document: {
      title: "Cisco Adaptive Security Appliance SNMP Remote Code Execution",
      publisher: CISA,
      distribution: { tlp: { label: "TLP:AMBER" } },
      tracking: {
        id: "ICSA-26-042-01",
        version: "1",
        status: "final",
        current_release_date: "2026-02-11T12:00:00.000Z",
      },
      notes: [
        {
          category: "summary",
          title: "Summary",
          text: "Successful exploitation of this vulnerability could allow an unauthenticated attacker with access to the SNMP management interface to execute arbitrary code or reload the appliance.",
        },
        {
          category: "other",
          title: "Risk Evaluation",
          text: "A buffer overflow in the SNMP code of Cisco ASA Software 8.4 and earlier is reachable with a crafted SNMPv2c packet and a known community string. Public exploit code exists.",
        },
      ],
      references: [
        {
          category: "self",
          summary: "ICSA-26-042-01 JSON",
          url: "https://www.cisa.gov/sites/default/files/csaf/icsa-26-042-01.json",
        },
        {
          category: "self",
          summary: "ICSA-26-042-01 Web Version",
          url: "https://www.cisa.gov/news-events/ics-advisories/icsa-26-042-01",
        },
      ],
    },
    product_tree: {
      branches: [
        {
          category: "vendor",
          name: "Cisco",
          branches: [
            {
              category: "product_name",
              name: "ASA 5505",
              product: {
                product_id: "CSAFPID-0201",
                name: "Cisco ASA 5505",
              },
            },
            {
              category: "product_name",
              name: "Adaptive Security Appliance Software",
              branches: [
                {
                  category: "product_version",
                  name: "8.2",
                  product: {
                    product_id: "CSAFPID-0202",
                    name: "Cisco Adaptive Security Appliance Software 8.2",
                  },
                },
                {
                  category: "product_version",
                  name: "9.1",
                  product: {
                    product_id: "CSAFPID-0203",
                    name: "Cisco Adaptive Security Appliance Software 9.1",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    vulnerabilities: [
      {
        cve: "CVE-2016-6366",
        cwe: {
          id: "CWE-121",
          name: "Stack-based Buffer Overflow",
        },
        notes: [
          {
            category: "summary",
            text: "The SNMP subsystem overflows a stack buffer while parsing a crafted SNMPv2c request, giving an unauthenticated attacker code execution on the appliance or a forced reload.",
          },
        ],
        product_status: {
          known_affected: ["CSAFPID-0201", "CSAFPID-0202"],
          fixed: ["CSAFPID-0203"],
        },
        remediations: [
          {
            category: "vendor_fix",
            details:
              "Upgrade to ASA Software 9.1 or later. The 5505 hardware is past end of support and has to be replaced to reach a fixed release.",
            product_ids: ["CSAFPID-0201", "CSAFPID-0202"],
            url: "https://sec.cloudapps.cisco.com/security/center/publicationListing.x",
          },
          {
            category: "workaround",
            details:
              "Restrict SNMP to a dedicated management host list and rotate the community string. Disable SNMP entirely on the appliance if it is not monitored.",
            product_ids: ["CSAFPID-0201", "CSAFPID-0202"],
          },
        ],
        scores: [
          {
            cvss_v3: {
              baseScore: 8.8,
              baseSeverity: "HIGH",
              vectorString: "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
            },
            products: ["CSAFPID-0201", "CSAFPID-0202"],
          },
        ],
      },
    ],
  },
  copy: {
    title:
      "CISA advisory: unauthenticated SNMP code execution on Cisco ASA 5505 appliances",
    summary:
      "CISA reports public exploit code for an SNMP buffer overflow in Cisco ASA Software 8.x. Both ASA 5505 appliances — the remote radiology VPN gateway and the perimeter firewall — run an affected release.",
    priority: Priority.High,
    priorityReasonWhy:
      "A known-exploited flaw on the two appliances that carry remote radiology access and the network perimeter, and the hardware cannot reach a fixed release.",
    hospitalImpact: {
      byline: "Both ASA 5505 appliances are past end of support",
      impactStatement:
        "Compromise of the VPN gateway cuts remote radiologist access and after-hours imaging coverage. Compromise of the perimeter firewall exposes DICOM and HL7 traffic and opens a path into the clinical VLANs. Neither box can be patched to a fixed release, so the real remediation is replacement.",
      careAreas: "Radiology, Hospital-wide network",
      likelihood:
        "Exploit code is public and needs no authentication, but the SNMP interface should only be reachable from the management segment — so this turns on whether that restriction actually holds.",
    },
  },
};

const ADVISORIES = [BAXTER, GE_HEALTHCARE, CISCO_ASA];

/**
 * The `.json` and HTML `self` references, which is where a real sync gets
 * `upstreamApi` and `webUrl` for the mapping — see `webUrlOf` in
 * `platforms/csaf/advisories/sync.ts`.
 */
const selfReferences = (doc: CsafDocument) => {
  const self = doc.document.references.filter((ref) => ref.category === "self");
  return {
    upstreamApi: self.find((ref) => ref.url.endsWith(".json"))?.url,
    webUrl: self.find((ref) => !ref.url.endsWith(".json"))?.url,
  };
};

const getSeedUser = async () => {
  const user = await prisma.user.findFirst({
    where: { email: SEED_USER_EMAIL },
  });
  if (!user) {
    throw new Error(
      `No ${SEED_USER_EMAIL} user — run \`npm run seed\` before this script.`,
    );
  }
  return user;
};

/**
 * Find-or-create the CSAF Integration the snapshots hang off. Its config points
 * at the real CISA provider metadata, so flipping these fixtures for a live sync
 * is a matter of running the connector, not re-configuring anything.
 */
const getCsafIntegration = async (userId: string) => {
  const existing = await prisma.integration.findFirst({
    where: { platform: PlatformEnum.CSAF },
  });
  if (existing) return existing;

  const integrationUser =
    (await prisma.user.findFirst({
      where: { email: INTEGRATION_USER_EMAIL },
    })) ??
    (await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: INTEGRATION_USER_EMAIL,
        name: "CSAF Integration",
        emailVerified: true,
      },
    }));

  return prisma.integration.create({
    data: {
      name: "CISA CSAF Advisories",
      platform: PlatformEnum.CSAF,
      config: { providerMetadataUrl: CISA_PROVIDER_METADATA_URL },
      syncEvery: 604800,
      userId,
      integrationUserId: integrationUser.id,
      resourceSyncs: { create: [{ resource: ResourceType.SourceRecord }] },
    },
  });
};

const seedAdvisory = async (
  fixture: AdvisoryFixture,
  integrationId: string,
): Promise<number> => {
  // Parsed with the platform's own schema: a fixture that drifts from what the
  // connector accepts fails here rather than seeding something unreachable.
  const parsed = csafDocumentSchema.parse(fixture.doc);
  const trackingId = parsed.document.tracking.id;

  const vulnerability = await prisma.vulnerability.findFirst({
    where: { cveId: fixture.cveId },
    select: {
      id: true,
      deviceGroupMatchings: { select: { id: true } },
    },
  });
  if (!vulnerability) {
    console.warn(
      `⚠️  ${fixture.cveId} is not seeded — skipping ${trackingId}. Run \`npm run seed\` first.`,
    );
    return 0;
  }

  // The same markdown the connector would have produced, from the same function.
  const markdown = toMarkdown(parsed);
  const { upstreamApi, webUrl } = selfReferences(parsed);

  const mapping = await prisma.externalSourceRecordMapping.upsert({
    where: {
      integrationId_externalId: { integrationId, externalId: trackingId },
    },
    create: {
      integrationId,
      externalId: trackingId,
      upstreamApi,
      webUrl,
      lastSynced: new Date(),
    },
    update: { upstreamApi, webUrl, lastSynced: new Date() },
  });

  // Rebuilt rather than upserted, for the reason seedFleetAdvisoryNotification
  // gives: a Notification has no natural unique key, so a re-run would stack a
  // second copy. Deleting the notification cascades its SourceLink; the
  // snapshots go separately because they hang off the mapping, which survives.
  await prisma.notification.deleteMany({
    where: {
      sourceLinks: { some: { sourceRecord: { mappingId: mapping.id } } },
    },
  });
  await prisma.sourceRecord.deleteMany({ where: { mappingId: mapping.id } });

  await prisma.notification.create({
    data: {
      type: NotificationType.Advisory,
      title: fixture.copy.title,
      summary: fixture.copy.summary,
      priority: fixture.copy.priority,
      priorityReasonWhy: fixture.copy.priorityReasonWhy,
      hospitalImpact: fixture.copy.hospitalImpact,
      vulnerabilities: {
        create: {
          vulnerabilityId: vulnerability.id,
          confidence: ConfidenceLevel.Matched,
          reasonWhy: `The advisory names ${fixture.cveId} directly.`,
        },
      },
      deviceGroupsMatchings: {
        create: vulnerability.deviceGroupMatchings.map((matching) => ({
          deviceGroupMatchingId: matching.id,
          confidence: ConfidenceLevel.Matched,
          reasonWhy: "The advisory's product tree names this make and model.",
        })),
      },
      sourceLinks: {
        create: {
          sourceRecord: {
            create: {
              channel: SourceChannel.Integration,
              tlp: parseTlp(parsed.document.distribution?.tlp?.label),
              mapping: { connect: { id: mapping.id } },
              raw: fixture.doc as Prisma.InputJsonValue,
              markdown,
              contentHash: sourceContentHash(fixture.doc, markdown),
            },
          },
        },
      },
    },
  });

  console.log(
    `  ✅ ${trackingId} → ${fixture.cveId}, ${vulnerability.deviceGroupMatchings.length} device group matching(s)`,
  );
  return vulnerability.deviceGroupMatchings.length;
};

async function main() {
  console.log("🌱 Seeding CSAF advisories against the existing hospital...\n");

  const user = await getSeedUser();
  const integration = await getCsafIntegration(user.id);
  console.log(`CSAF integration ${integration.id} (${integration.name})\n`);

  let matchings = 0;
  for (const fixture of ADVISORIES) {
    matchings += await seedAdvisory(fixture, integration.id);
  }

  console.log(
    `\n✅ Seeded ${ADVISORIES.length} CSAF advisory notification(s) covering ${matchings} device group matching(s)`,
  );
}

main()
  .catch((error) => {
    console.error("\n❌ Error seeding CSAF advisories:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
