import {
  createVulnerabilityRecord,
  cvssMetricType,
} from "@/features/vulnerabilities/server/records";
import { Priority, Severity, VulnerabilitySource } from "@/generated/prisma";
import prisma from "@/lib/db";
import { matchingForGroup } from "./canonical-identity";

// Vulnerabilities — cpes is an array to support multi-device-group linking
const SAMPLE_VULNERABILITIES = [
  // ── CVE-2023-00001: Siemens Healthineers imaging firmware (High) ─────────────
  // Hypothetical CVE used for seed data, in the reserved-looking 00001 range so
  // it cannot be mistaken for a real Healthineers advisory. The advisory id and
  // the firmware version below are invented for the same reason.
  //
  // The only vulnerability naming Siemens CPEs, and the two device groups it
  // reaches are the ones the Fleet integration manages. Its DeviceGroupMatchings
  // are therefore what lets a mitigation plan resolve a teamplay Fleet work
  // order target — without it nothing in the seed exercises that path.
  {
    cveId: "CVE-2023-00001",
    severity: Severity.High,
    cvssScore: 7.8,
    epss: 0.08,
    inKEV: false,
    priority: Priority.High,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "ICS Security Scanner" } },
          results: [
            {
              ruleId: "CVE-2023-00001",
              level: "error",
              message: {
                text: "Siemens Healthineers imaging system service interface permits privilege escalation from an unprivileged local account (CWE-269)",
              },
            },
          ],
        },
      ],
    },
    cpes: [
      "cpe:2.3:h:siemens:magnetom_sola:-:*:*:*:*:*:*:*",
      "cpe:2.3:h:siemens:somatom_go.top:-:*:*:*:*:*:*:*",
    ],
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2023-00001",
    description:
      "The service interface on Siemens Healthineers MAGNETOM and SOMATOM imaging systems does not correctly restrict privileges, so an unprivileged local account can escalate to administrative rights on the scanner console (CWE-269). Siemens services these systems under contract and supplies the firmware update.",
    narrative:
      "A technologist account on the MAGNETOM Sola or SOMATOM go.Top console can reach a service interface that fails to check privileges before running maintenance routines. From there an attacker gains administrative control of the scanner, which is enough to change imaging protocols, disable the device, or read prior studies held locally. The remediation is a firmware update that only Siemens field service can apply, because the hospital holds no service credentials for these consoles.",
    impact:
      "Radiology loses a scanner for the length of the service visit, and the department has one unit of each modality. An MRI outage pushes stroke and trauma imaging to CT or to a transfer, so the patch window has to sit outside the acute hours. Because Siemens performs the work, the hospital cannot schedule it alone — the work order has to reach teamplay Fleet.",
  },
  // ── CVE-2020-25175: GE Healthcare Credential Exposure (Critical) ─────────────
  {
    cveId: "CVE-2020-25175",
    severity: Severity.Critical,
    cvssScore: 9.8,
    epss: 0.35,
    inKEV: false,
    priority: Priority.Critical,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "ICS Security Scanner" } },
          results: [
            {
              ruleId: "CVE-2020-25175",
              level: "error",
              message: {
                text: "GE Healthcare imaging device transmits credentials with insufficient protection across the network (CWE-522/CWE-523)",
              },
            },
          ],
        },
      ],
    },
    cpes: [
      "cpe:2.3:h:gehealthcare:brightspeed_elite_select:-:*:*:*:*:*:*:*",
      "cpe:2.3:h:gehealthcare:logiq_e:r7:*:*:*:*:*:*:*",
      "cpe:2.3:h:gehealthcare:optima_xr200amx:-:*:*:*:*:*:*:*",
    ],
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2020-25175",
    description:
      "GE Healthcare imaging and ultrasound products may allow specific credentials to be exposed during transport over the network due to insufficiently protected credential transmission (CWE-522/CWE-523). Affects the BrightSpeed Elite Select CT scanner, LOGIQ e R7 portable ultrasound units, and Optima XR200amx X-ray system.",
    narrative:
      "The GE BrightSpeed Elite Select CT scanner, LOGIQ e R7 ultrasound units, and Optima XR200amx transmit service credentials with insufficient protection during normal network operations. An attacker with access to the DICOM VLAN can passively intercept these credentials and use them to gain unauthorized access to scanner configuration interfaces — potentially altering imaging protocols, disabling devices, or pivoting to connected workstations. GE Healthcare issued Security Bulletin GE-2020-004 recommending network isolation and firmware updates.",
    impact:
      "Credential compromise on imaging devices could allow attackers to alter scanner calibration or protocols, disabling devices during active patient care. In a radiology emergency workflow (stroke, trauma), device unavailability can directly delay time-critical diagnoses. The DICOM VLAN provides network adjacency to PACS and clinical workstations for further lateral movement.",
  },
  // ── CVE-2017-0144: EternalBlue / MS17-010 (SMBv1 RCE, Critical, KEV) ────────
  {
    cveId: "CVE-2017-0144",
    severity: Severity.Critical,
    cvssScore: 9.8,
    epss: 0.97,
    inKEV: true,
    priority: Priority.Critical,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "Endpoint Scanner" } },
          results: [
            {
              ruleId: "CVE-2017-0144",
              level: "error",
              message: {
                text: "EternalBlue SMBv1 remote code execution on end-of-life Windows host — WannaCry/NotPetya exploit vector",
              },
            },
          ],
        },
      ],
    },
    // Connects to both the EOL OS device groups AND the application-level device
    // groups
    cpes: [
      "cpe:2.3:o:microsoft:windows_7:-:*:*:*:*:*:*:*",
      "cpe:2.3:o:microsoft:windows_server_2008:r2:sp1:*:*:*:*:x64:*",
      "cpe:2.3:a:gehealthcare:advantage_workstation:4.6:*:*:*:*:*:*:*",
      "cpe:2.3:a:gehealthcare:centricity_pacs_iw:5.0:*:*:*:*:*:*:*",
      "cpe:2.3:a:gehealthcare:centricity_pacs_iw:-:*:*:*:*:*:*:*",
      "cpe:2.3:h:dell:optiplex_790:-:*:*:*:*:*:*:*",
    ],
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2017-0144",
    description:
      "Windows SMBv1 remote code execution vulnerability (MS17-010) allows unauthenticated remote attackers to execute arbitrary code via crafted SMB packets. Exploited by WannaCry and NotPetya ransomware. End-of-life Windows 7 or Windows Server 2008 R2 devices cannot receive the MS17-010 patch through standard Windows Update.",
    narrative:
      "The EternalBlue exploit (developed by the NSA, leaked by the Shadow Brokers) is available in Metasploit and requires no authentication. WannaCry and NotPetya ransomware campaigns brought hospital imaging departments offline globally in 2017 using this exact vector. The CT acquisition workstation, PACS server, both radiology reading workstations, and the ED image viewer are all susceptible.",
    impact:
      "Ransomware infection or complete compromise of the entire imaging workflow chain: CT acquisition, PACS storage and routing, radiology reading, and ED viewing. A WannaCry-style attack would encrypt DICOM archives, disabling radiologist access to historical studies and blocking active imaging workflows. In a hospital without fallback procedures, this creates a patient safety emergency for active stroke, trauma, and critical care cases.",
  },
  // ── CVE-2016-6366: EXTRABACON — Cisco ASA SNMP Buffer Overflow (High, KEV) ──
  {
    cveId: "CVE-2016-6366",
    severity: Severity.High,
    cvssScore: 8.8,
    epss: 0.21,
    inKEV: true,
    priority: Priority.High,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "Network Scanner" } },
          results: [
            {
              ruleId: "CVE-2016-6366",
              level: "warning",
              message: {
                text: "Cisco ASA SNMP buffer overflow (EXTRABACON) allows unauthenticated remote code execution on ASA OS 8.x",
              },
            },
          ],
        },
      ],
    },
    cpes: [
      "cpe:2.3:h:cisco:asa_5505:-:*:*:*:*:*:*:*",
      "cpe:2.3:a:cisco:adaptive_security_appliance_software:8.2:*:*:*:*:*:*:*",
    ],
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2016-6366",
    description:
      "Buffer overflow in the SNMP code of Cisco ASA Software versions 8.4 and earlier allows unauthenticated remote attackers to execute arbitrary code or reload the device via crafted SNMPv2c packets. Disclosed by the Shadow Brokers as the EXTRABACON exploit. Both ASA 5505 devices in this network (remote radiology VPN gateway and perimeter firewall) run ASA OS 8.2.",
    narrative:
      "Both Cisco ASA 5505 appliances — the remote radiology VPN gateway and the perimeter firewall — run ASA OS 8.2, falling within the EXTRABACON exploit range (ASA 8.4 and earlier). The exploit is publicly available and was part of the NSA Equation Group toolkit leaked by the Shadow Brokers in 2016. An attacker on the same network segment as the SNMP management interface can send crafted SNMPv2c packets to gain unauthenticated remote code execution. Compromise of the VPN gateway directly cuts off remote radiologist access; compromise of the firewall exposes the full hospital network.",
    impact:
      "Compromise of the VPN gateway severs remote radiologist connectivity, disabling after-hours imaging coverage and potentially delaying critical results. Compromise of the perimeter firewall allows the attacker to modify security policy, intercept all DICOM/HL7 traffic, and pivot freely into clinical VLANs containing imaging devices, PACS, and patient monitoring infrastructure.",
  },
  // ── CVE-2021-12345: Baxter Sigma Spectrum Buffer Overflow (High) ────────────
  // Hypothetical CVE used for seed data — drives the "Update Baxter Infusion
  // Pumps Firmware" change ticket and creates Issue records for all 23 pumps.
  {
    cveId: "CVE-2021-12345",
    severity: Severity.High,
    cvssScore: 8.1,
    epss: 0.04,
    inKEV: false,
    priority: Priority.High,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "Medical Device Scanner" } },
          results: [
            {
              ruleId: "CVE-2021-12345",
              level: "warning",
              message: {
                text: "Baxter Sigma Spectrum infusion pump firmware contains a buffer overflow in the wireless management interface allowing remote code execution from the same wireless segment",
              },
            },
          ],
        },
      ],
    },
    cpes: ["cpe:2.3:h:baxter:sigma_spectrum:-:*:*:*:*:*:*:*"],
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2021-12345",
    description:
      "Buffer overflow in the wireless management interface of Baxter Sigma Spectrum infusion pumps running firmware versions prior to 8.x allows an attacker on the same wireless segment to execute arbitrary code or crash the device via crafted management packets. All 23 Sigma Spectrum pumps on WARD-VLAN-20 are running the vulnerable firmware (v1.2.3).",
    narrative:
      "The Baxter Sigma Spectrum pump fleet on the medical-surgical floor is running firmware v1.2.3, which contains a buffer overflow in the wireless management interface. An attacker with access to WARD-VLAN-20 can send crafted management packets to crash a pump or execute code in the pump's control context. Baxter has issued an updated firmware release that addresses the vulnerability, but each pump must be taken out of service, updated, and clinically validated before being returned to patient use.",
    impact:
      "A successful exploit could cause a pump to crash mid-infusion, interrupting medication delivery to a patient. In the worst case, code execution could allow an attacker to alter infusion parameters (rate, volume, dose) — a direct patient-safety risk for any patient on continuous IV medication. With all 23 pumps running the vulnerable firmware, a worm-style attack could disable the entire medical-surgical infusion fleet simultaneously.",
  },
];

export async function seedVulnerabilities(userId: string) {
  console.log("\n🌱 Seeding vulnerabilities...");

  // Sequential so shared DeviceGroupMatching find-or-create is race-free.
  const vulnerabilities = [];
  for (const vulnerability of SAMPLE_VULNERABILITIES) {
    const {
      cpes,
      cveId,
      severity,
      cvssScore,
      epss,
      inKEV,
      priority,
      sarif,
      exploitUri,
      description,
      narrative,
      impact,
    } = vulnerability;

    const deviceGroups = (
      await Promise.all(
        cpes.map((cpe) =>
          prisma.deviceGroup.findFirst({
            where: { cpe: { has: cpe } },
            select: {
              id: true,
              manufacturerId: true,
              productId: true,
              versionId: true,
            },
          }),
        ),
      )
    ).filter((dg): dg is NonNullable<typeof dg> => dg !== null);

    if (deviceGroups.length === 0) {
      console.warn(`⚠️  No device groups found for CPEs: ${cpes.join(", ")}`);
      continue;
    }

    // Connect a shared matching per distinct device-group identity so the match
    // resolver (and issue-creation extension) link them back correctly.
    const uniqueGroups = [
      ...new Map(deviceGroups.map((dg) => [dg.id, dg])).values(),
    ];
    const matchingIds = (
      await Promise.all(uniqueGroups.map(matchingForGroup))
    ).filter((id): id is string => id !== null);

    const { vulnerabilityId } = await createVulnerabilityRecord(
      {
        source: VulnerabilitySource.TA3,
        identifiers: [cveId],
        details: description,
        metrics: [{ type: cvssMetricType(), score: cvssScore, severity }],
        deviceGroupMatchingIds: matchingIds,
        ta3Submission: { sarif, narrative, impact, exploitUri },
        userId,
      },
      { actingUserId: userId },
    );
    // TODO: VW-540 EPSS and KEV become records from enrichment in PR 2, and priority moves to
    // Issue in VW-541. Until then they live on the vulnerability.
    const created = await prisma.vulnerability.update({
      where: { id: vulnerabilityId },
      data: { epss, inKEV, priority },
    });
    vulnerabilities.push(created);
  }

  console.log(`✅ Seeded ${vulnerabilities.length} vulnerabilities`);
  return vulnerabilities;
}
