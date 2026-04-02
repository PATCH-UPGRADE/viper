import {
  type AssetStatus,
  AuthType,
  IntegrationType,
  IssueStatus,
  Priority,
  ResourceType,
  Severity,
  Tlp,
} from "@/generated/prisma";
import prisma from "../src/lib/db";

const CISA_INTEGRATION = {
  name: "CISA CSAF",
  platform: "CISA",
  integrationUri:
    "https://www.cisa.gov/sites/default/files/csaf/provider-metadata.json",
  integrationType: IntegrationType.CSAF,
  authType: AuthType.None,
  resourceType: ResourceType.Vulnerability,
  syncEvery: 6 * 60 * 60, // 21600 seconds = 6 hours
};

async function createOrGetCisaIntegration(seedUserId: string) {
  const existing = await prisma.integration.findFirst({
    where: { integrationUri: CISA_INTEGRATION.integrationUri },
    include: { integrationUser: true },
  });
  if (existing?.integrationUser) {
    console.log("✅ Found existing CISA integration user");
    return existing.integrationUser;
  }

  const integrationUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: CISA_INTEGRATION.name },
  });

  await prisma.integration.create({
    data: {
      ...CISA_INTEGRATION,
      userId: seedUserId,
      integrationUserId: integrationUser.id,
    },
  });

  console.log("✅ Created CISA CSAF integration and integration user");
  return integrationUser;
}

const SEED_USER = {
  email: "user@example.com",
};

const DEVICE_GROUP = {
  cpe: "cpe:2.3:h:baxter:life2000_ventilation_system:06.08.00.00:*:*:*:*:*:*:*",
  manufacturer: "Baxter",
  modelName: "Life2000 Ventilation System",
  version: "06.08.00.00",
};

const ASSETS = [
  {
    ip: "192.168.30.11",
    networkSegment: "ICU-VENT",
    role: "Ventilator",
    upstreamApi: "https://www.baxter.com/product-security",
    hostname: "icu-vent-01",
    macAddress: "00:1A:2B:3C:4D:01",
    serialNumber: "L2K-2024-00001",
    location: {
      facility: "Main Hospital",
      building: "Tower A",
      floor: "3",
      room: "ICU-301",
    },
    status: "Active" as AssetStatus,
  },
  {
    ip: "192.168.30.12",
    networkSegment: "ICU-VENT",
    role: "Ventilator",
    upstreamApi: "https://www.baxter.com/product-security",
    hostname: "icu-vent-02",
    macAddress: "00:1A:2B:3C:4D:02",
    serialNumber: "L2K-2024-00002",
    location: {
      facility: "Main Hospital",
      building: "Tower A",
      floor: "3",
      room: "ICU-302",
    },
    status: "Active" as AssetStatus,
  },
  {
    ip: "192.168.30.13",
    networkSegment: "ICU-VENT",
    role: "Ventilator",
    upstreamApi: "https://www.baxter.com/product-security",
    hostname: "icu-vent-03",
    macAddress: "00:1A:2B:3C:4D:03",
    serialNumber: "L2K-2024-00003",
    location: {
      facility: "Main Hospital",
      building: "Tower A",
      floor: "3",
      room: "ICU-303",
    },
    status: "Active" as AssetStatus,
  },
  {
    ip: "192.168.30.14",
    networkSegment: "ICU-VENT",
    role: "Ventilator",
    upstreamApi: "https://www.baxter.com/product-security",
    hostname: "icu-vent-04",
    macAddress: "00:1A:2B:3C:4D:04",
    serialNumber: "L2K-2024-00004",
    location: {
      facility: "Main Hospital",
      building: "Tower B",
      floor: "2",
      room: "PICU-201",
    },
    status: "Active" as AssetStatus,
  },
  {
    ip: "192.168.30.15",
    networkSegment: "ICU-VENT",
    role: "Ventilator",
    upstreamApi: "https://www.baxter.com/product-security",
    hostname: "icu-vent-05",
    macAddress: "00:1A:2B:3C:4D:05",
    serialNumber: "L2K-2024-00005",
    location: {
      facility: "Main Hospital",
      building: "Tower B",
      floor: "2",
      room: "PICU-202",
    },
    status: "Maintenance" as AssetStatus,
  },
];

const VULNERABILITIES = [
  {
    cveId: "CVE-2024-9834",
    severity: Severity.Critical,
    cvssScore: 9.3,
    cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
    description:
      "Improper data protection on the ventilator's serial interface could allow an attacker to send and receive messages that result in unauthorized disclosure of information and/or have unintended impacts on device settings and performance.",
    narrative:
      "An attacker with physical access to the serial interface can intercept and inject unencrypted messages, potentially altering ventilator settings or extracting patient data without detection. This is particularly dangerous in ICU environments where ventilators are life-critical devices.",
    impact:
      "Unauthorized disclosure of patient respiratory data and potential disruption of ventilator function in life-critical ICU settings.",
    affectedComponents: ["Serial Interface"],
    priority: Priority.Critical,
    inKEV: false,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "CISA ICS-CERT" } },
          results: [
            {
              ruleId: "CVE-2024-9834",
              level: "error",
              message: {
                text: "Cleartext transmission of sensitive information via serial interface on Baxter Life2000 Ventilation System",
              },
            },
          ],
        },
      ],
    },
  },
  {
    cveId: "CVE-2024-9832",
    severity: Severity.Critical,
    cvssScore: 9.3,
    cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
    description:
      "There is no limit on the number of failed login attempts permitted with the Clinician Password or the Serial Number Clinician Password. An attacker could execute a brute-force attack to gain unauthorized access to the ventilator, and then make changes to device settings that could disrupt the function of the device and/or result in unauthorized information disclosure.",
    narrative:
      "Without any lockout mechanism, an attacker can systematically try all possible clinician passwords via the serial interface. Once authenticated, they gain full clinician-level control over the device, able to modify ventilation parameters such as tidal volume, respiratory rate, and PEEP without triggering any alerts.",
    impact:
      "Full unauthorized clinician-level access to ventilator controls, enabling arbitrary modification of life-critical ventilation parameters.",
    affectedComponents: ["Authentication", "Serial Interface"],
    priority: Priority.Critical,
    inKEV: false,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "CISA ICS-CERT" } },
          results: [
            {
              ruleId: "CVE-2024-9832",
              level: "error",
              message: {
                text: "No brute-force protection on clinician authentication in Baxter Life2000 Ventilation System",
              },
            },
          ],
        },
      ],
    },
  },
  {
    cveId: "CVE-2024-48971",
    severity: Severity.Critical,
    cvssScore: 9.3,
    cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
    description:
      "The Clinician Password and Serial Number Clinician Password are hard-coded into the ventilator in plaintext form. This could allow an attacker to obtain the password off the ventilator and use it to gain unauthorized access to the device, with clinician privileges.",
    narrative:
      "Hard-coded credentials in firmware are extractable via JTAG or serial debug access (see related CVEs). Once extracted, the same password applies across all Life2000 units of this firmware version deployed hospital-wide — a single extraction compromises the entire fleet.",
    impact:
      "Fleet-wide credential compromise; any attacker who extracts the hard-coded password gains clinician access to all deployed Life2000 units running this firmware version.",
    affectedComponents: ["Firmware", "Authentication"],
    priority: Priority.Critical,
    inKEV: false,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "CISA ICS-CERT" } },
          results: [
            {
              ruleId: "CVE-2024-48971",
              level: "error",
              message: {
                text: "Hard-coded credentials stored in plaintext firmware on Baxter Life2000 Ventilation System",
              },
            },
          ],
        },
      ],
    },
  },
  {
    cveId: "CVE-2024-48973",
    severity: Severity.Critical,
    cvssScore: 9.3,
    cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
    description:
      "The debug port on the ventilator's serial interface is enabled by default. This could allow an attacker to send and receive messages over the debug port (which are unencrypted) that result in unauthorized disclosure of information and/or have unintended impacts on device settings and performance.",
    narrative:
      "The always-on debug port provides an unauthenticated, unencrypted channel into the device. Combined with the cleartext serial interface (CVE-2024-9834), this creates a high-bandwidth attack surface for any person with brief physical access to the device.",
    impact:
      "Unauthenticated access to device internals via debug port, enabling information disclosure and device manipulation without leaving audit traces.",
    affectedComponents: ["Debug Interface", "Serial Interface"],
    priority: Priority.Critical,
    inKEV: false,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "CISA ICS-CERT" } },
          results: [
            {
              ruleId: "CVE-2024-48973",
              level: "error",
              message: {
                text: "Debug port enabled by default on serial interface of Baxter Life2000 Ventilation System",
              },
            },
          ],
        },
      ],
    },
  },
  {
    cveId: "CVE-2024-48974",
    severity: Severity.Critical,
    cvssScore: 9.3,
    cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
    description:
      "The ventilator does not perform proper file integrity checks when adopting firmware updates. This makes it possible for an attacker to force unauthorized changes to the device's configuration settings and/or compromise device functionality by pushing a compromised/illegitimate firmware file.",
    narrative:
      "With no cryptographic verification on firmware images, an attacker who gains serial access can push malicious firmware that silently alters ventilation behavior — for example, capping oxygen delivery or disabling alarms — while appearing functional to clinical staff.",
    impact:
      "Persistent device compromise via malicious firmware; attacker-controlled ventilation behavior with no detection mechanism for clinical staff.",
    affectedComponents: ["Firmware Update", "Integrity Check"],
    priority: Priority.Critical,
    inKEV: false,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "CISA ICS-CERT" } },
          results: [
            {
              ruleId: "CVE-2024-48974",
              level: "error",
              message: {
                text: "No firmware integrity check on updates for Baxter Life2000 Ventilation System",
              },
            },
          ],
        },
      ],
    },
  },
  {
    cveId: "CVE-2024-48970",
    severity: Severity.Critical,
    cvssScore: 9.3,
    cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
    description:
      "The ventilator's microcontroller lacks memory protection. An attacker could connect to the internal JTAG interface and read or write to flash memory using an off-the-shelf debugging tool, which could disrupt the function of the device and/or cause unauthorized information disclosure.",
    narrative:
      "JTAG access with no memory protection means an attacker with a ~$20 hardware debugger can dump the entire firmware image, extract hard-coded credentials, and modify memory at runtime. This is the root-cause enabler for multiple other CVEs in this advisory.",
    impact:
      "Complete firmware extraction and runtime memory manipulation via JTAG; root-cause vulnerability enabling exploitation of CVE-2024-48971 (hard-coded credentials) and CVE-2024-48974 (unsigned firmware).",
    affectedComponents: [
      "Microcontroller",
      "JTAG Interface",
      "Memory Protection",
    ],
    priority: Priority.Critical,
    inKEV: false,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "CISA ICS-CERT" } },
          results: [
            {
              ruleId: "CVE-2024-48970",
              level: "error",
              message: {
                text: "Microcontroller lacks memory protection — JTAG flash read/write on Baxter Life2000 Ventilation System",
              },
            },
          ],
        },
      ],
    },
  },
  {
    cveId: "CVE-2020-8004",
    severity: Severity.High,
    cvssScore: 7.5,
    cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
    description:
      "The flash memory read-out protection feature on the microcontroller does not block memory access via the ICode bus. Attackers can exploit this in conjunction with certain CPU exception handling behaviors to gain knowledge of how the onboard flash memory is organized and ultimately bypass read-out protection to expose memory contents.",
    narrative:
      "This microcontroller-level flaw predates the device's deployment and has been known since 2020. The ICode bus bypass allows reading protected flash regions by triggering specific CPU exception states — no specialized hardware required beyond basic JTAG access already enabled by CVE-2024-48970.",
    impact:
      "Bypass of flash read-out protection, exposing full firmware contents including hard-coded credentials and proprietary clinical algorithms.",
    affectedComponents: [
      "Microcontroller",
      "Flash Memory",
      "Read-out Protection",
    ],
    priority: Priority.High,
    inKEV: false,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "CISA ICS-CERT" } },
          results: [
            {
              ruleId: "CVE-2020-8004",
              level: "warning",
              message: {
                text: "Flash read-out protection bypass via ICode bus on microcontroller in Baxter Life2000 Ventilation System",
              },
            },
          ],
        },
      ],
    },
  },
  {
    cveId: "CVE-2024-48966",
    severity: Severity.Critical,
    cvssScore: 10.0,
    cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
    description:
      "The software tools used by service personnel to test & calibrate the ventilator do not support user authentication. An attacker with access to the Service PC where the tools are installed could obtain diagnostic information through the test tool or manipulate the ventilator's settings and embedded software via the calibration tool, without having to authenticate to either tool.",
    narrative:
      "Service PCs in hospital biomedical engineering departments are often shared, lightly secured workstations. An attacker with brief access to such a workstation can use the unauthenticated service tools to fully reconfigure any Life2000 unit the PC has been connected to, with no credential barrier whatsoever.",
    impact:
      "Full unauthenticated control over ventilator settings and embedded software via service tooling; anyone with service PC access can silently alter device calibration or compromise device software.",
    affectedComponents: [
      "Service Tools",
      "Calibration Software",
      "Authentication",
    ],
    priority: Priority.Critical,
    inKEV: false,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "CISA ICS-CERT" } },
          results: [
            {
              ruleId: "CVE-2024-48966",
              level: "error",
              message: {
                text: "No authentication on service/calibration tools for Baxter Life2000 Ventilation System",
              },
            },
          ],
        },
      ],
    },
  },
  {
    cveId: "CVE-2024-48967",
    severity: Severity.Critical,
    cvssScore: 10.0,
    cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
    description:
      "The ventilator and the Service PC lack sufficient audit logging capabilities to allow for detection of malicious activity and subsequent forensic examination. An attacker with access to the ventilator and/or the Service PC could, without detection, make unauthorized changes to ventilator settings that result in unauthorized disclosure of information and/or have unintended impacts on device performance.",
    narrative:
      "The absence of audit logging means that any exploitation of the other vulnerabilities in this advisory leaves no forensic trace. Security teams cannot determine if a device has been tampered with, making incident response and post-event investigation impossible without physical device inspection.",
    impact:
      "No detection or forensic capability for malicious activity; exploitation of any other CVE in this advisory is completely invisible to security monitoring and incident response teams.",
    affectedComponents: ["Audit Logging", "Forensics"],
    priority: Priority.Critical,
    inKEV: false,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "CISA ICS-CERT" } },
          results: [
            {
              ruleId: "CVE-2024-48967",
              level: "error",
              message: {
                text: "Insufficient audit logging on ventilator and Service PC for Baxter Life2000 Ventilation System",
              },
            },
          ],
        },
      ],
    },
  },
];

const CSAF_REMEDIATIONS = [
  {
    category: "mitigation",
    details:
      "Baxter plans to issue a follow-up announcement in Q2 2025 regarding the Life2000 vulnerabilities described in this disclosure.",
    product_ids: ["CSAFPID-0001"],
  },
  {
    category: "mitigation",
    details:
      "Baxter is unaware of any exploitation of these vulnerabilities and/or the compromise of personal or health data.",
    product_ids: ["CSAFPID-0001"],
  },
  {
    category: "vendor_fix",
    details:
      "Baxter recommends that users of the Life2000 Ventilation System not leave their ventilators unattended in public or unsecured areas. Maintaining physical possession and control of the ventilator reduces the likelihood of a malicious actor gaining access to the device.",
    product_ids: ["CSAFPID-0001"],
  },
  {
    category: "mitigation",
    details:
      "For more information, refer to Baxter's Product Security and Responsible Disclosures web page.",
    product_ids: ["CSAFPID-0001"],
    url: "https://www.baxter.com/product-security",
  },
];

const CSAF_JSON = {
  document: {
    acknowledgments: [
      { names: ["Baxter"], summary: "reporting these vulnerabilities to CISA" },
    ],
    category: "csaf_security_advisory",
    csaf_version: "2.0",
    distribution: {
      text: "Disclosure is not limited",
      tlp: { label: "WHITE", url: "https://us-cert.cisa.gov/tlp/" },
    },
    lang: "en-US",
    notes: [
      {
        category: "legal_disclaimer",
        text: 'All information products included in https://us-cert.cisa.gov/ics are provided "as is" for informational purposes only.',
        title: "Legal Notice",
      },
      {
        category: "summary",
        text: "Successful exploitation of these vulnerabilities could lead to information disclosure and/or disruption of the device's function without detection.",
        title: "Risk evaluation",
      },
      {
        category: "other",
        text: "Healthcare and Public Health",
        title: "Critical infrastructure sectors",
      },
      {
        category: "other",
        text: "United States",
        title: "Countries/areas deployed",
      },
      {
        category: "other",
        text: "United States",
        title: "Company headquarters location",
      },
    ],
    publisher: {
      category: "coordinator",
      contact_details: "central@cisa.dhs.gov",
      name: "CISA",
      namespace: "https://www.cisa.gov/",
    },
    references: [
      {
        category: "self",
        summary: "ICS Advisory ICSMA-24-319-01 JSON",
        url: "https://raw.githubusercontent.com/cisagov/CSAF/develop/csaf_files/OT/white/2024/icsma-24-319-01.json",
      },
      {
        category: "self",
        summary: "ICSA Advisory ICSMA-24-319-01 - Web Version",
        url: "https://www.cisa.gov/news-events/ics-medical-advisories/icsma-24-319-01",
      },
    ],
    title: "Baxter Life2000 Ventilation System",
    tracking: {
      current_release_date: "2024-11-14T07:00:00.000000Z",
      generator: { engine: { name: "CISA CSAF Generator", version: "1.0.0" } },
      id: "ICSMA-24-319-01",
      initial_release_date: "2024-11-14T07:00:00.000000Z",
      revision_history: [
        {
          date: "2024-11-14T07:00:00.000000Z",
          legacy_version: "Initial",
          number: "1",
          summary: "Initial Publication",
        },
      ],
      status: "final",
      version: "1",
    },
  },
  product_tree: {
    branches: [
      {
        branches: [
          {
            branches: [
              {
                category: "product_version_range",
                name: "<=06.08.00.00",
                product: {
                  name: "Baxter Life2000 Ventilation System: <=06.08.00.00",
                  product_id: "CSAFPID-0001",
                },
              },
            ],
            category: "product_name",
            name: "Life2000 Ventilation System",
          },
        ],
        category: "vendor",
        name: "Baxter",
      },
    ],
  },
  vulnerabilities: VULNERABILITIES.map((v) => ({
    cve: v.cveId,
    notes: [
      {
        category: "summary",
        text: v.description,
        title: "Vulnerability Summary",
      },
    ],
    product_status: { known_affected: ["CSAFPID-0001"] },
    remediations: CSAF_REMEDIATIONS,
    scores: [
      {
        cvss_v3: {
          baseScore: v.cvssScore,
          baseSeverity: v.severity === Severity.Critical ? "CRITICAL" : "HIGH",
          vectorString: v.cvssVector,
          version: "3.1",
        },
        products: ["CSAFPID-0001"],
      },
    ],
  })),
};

async function createOrGetSeedUser() {
  console.log("\n👤 Finding/creating seed user...");

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: SEED_USER.email },
  });
  console.log(`✅ Found existing seed user: ${SEED_USER.email}`);
  return user;
}

async function seedDeviceGroup() {
  console.log("\n🌱 Upserting Baxter Life2000 device group...");

  const deviceGroup = await prisma.deviceGroup.upsert({
    where: { cpe: DEVICE_GROUP.cpe },
    update: DEVICE_GROUP,
    create: DEVICE_GROUP,
  });

  console.log(`✅ Device group: ${deviceGroup.modelName} (${deviceGroup.id})`);
  return deviceGroup;
}

async function seedAssets(userId: string, deviceGroupId: string) {
  console.log("\n🌱 Seeding assets...");

  const assets = await Promise.all(
    ASSETS.map(async (asset) => {
      const existing = await prisma.asset.findFirst({
        where: { serialNumber: asset.serialNumber },
      });
      if (existing) return existing;
      return prisma.asset.create({ data: { ...asset, deviceGroupId, userId } });
    }),
  );

  console.log(`✅ Seeded ${assets.length} assets`);
  return assets;
}

async function seedVulnerabilities(userId: string, deviceGroupId: string) {
  console.log("\n🌱 Seeding vulnerabilities...");

  const vulns = await Promise.all(
    VULNERABILITIES.map(async ({ ...data }) => {
      const existing = await prisma.vulnerability.findFirst({
        where: { cveId: data.cveId },
      });
      if (existing) return existing;
      return prisma.vulnerability.create({
        data: {
          ...data,
          userId,
          affectedDeviceGroups: { connect: { id: deviceGroupId } },
        },
      });
    }),
  );

  console.log(`✅ Seeded ${vulns.length} vulnerabilities`);
  return vulns;
}

async function seedAdvisory(
  userId: string,
  deviceGroupId: string,
  vulnIds: string[],
) {
  console.log("\n🌱 Upserting advisory...");

  const UPSTREAM_URL =
    "https://raw.githubusercontent.com/cisagov/CSAF/develop/csaf_files/OT/white/2024/icsma-24-319-01.json";

  const advisory = await prisma.advisory.upsert({
    where: { upstreamUrl: UPSTREAM_URL },
    update: {
      title: "Baxter Life2000 Ventilation System",
      severity: Severity.Critical,
      tlp: Tlp.WHITE,
      summary:
        "Successful exploitation of these vulnerabilities could lead to information disclosure and/or disruption of the device's function without detection.",
      publishedAt: new Date("2024-11-14T07:00:00.000Z"),
      status: IssueStatus.ACTIVE,
      csaf: CSAF_JSON,
      referencedVulnerabilities: {
        set: vulnIds.map((id) => ({ id })),
      },
      affectedDeviceGroups: {
        set: [{ id: deviceGroupId }],
      },
    },
    create: {
      userId,
      title: "Baxter Life2000 Ventilation System",
      severity: Severity.Critical,
      tlp: Tlp.WHITE,
      upstreamUrl: UPSTREAM_URL,
      summary:
        "Successful exploitation of these vulnerabilities could lead to information disclosure and/or disruption of the device's function without detection.",
      publishedAt: new Date("2024-11-14T07:00:00.000Z"),
      status: IssueStatus.ACTIVE,
      csaf: CSAF_JSON,
      referencedVulnerabilities: {
        connect: vulnIds.map((id) => ({ id })),
      },
      affectedDeviceGroups: {
        connect: [{ id: deviceGroupId }],
      },
    },
  });

  console.log(`✅ Advisory upserted: ${advisory.title} (${advisory.id})`);
  return advisory;
}

async function main() {
  console.log(
    "🚀 Seeding ICSMA-24-319-01: Baxter Life2000 Ventilation System\n",
  );

  const user = await createOrGetSeedUser();
  const integrationUser = await createOrGetCisaIntegration(user.id);
  const deviceGroup = await seedDeviceGroup();
  await seedAssets(user.id, deviceGroup.id);
  const vulns = await seedVulnerabilities(integrationUser.id, deviceGroup.id);
  await seedAdvisory(
    integrationUser.id,
    deviceGroup.id,
    vulns.map((v) => v.id),
  );

  console.log("\n✨ Done.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
