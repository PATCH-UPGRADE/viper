import { hashPassword } from "better-auth/crypto";
import {
  type ArtifactType,
  type AssetStatus,
  Priority,
  Severity,
  TicketCategory,
  TicketSource,
  TicketStatus,
} from "@/generated/prisma";
import prisma from "@/lib/db";

// Seed user credentials
const SEED_USER = {
  email: "user@example.com",
  password: "1337_gone_jolene",
  name: "Seed User",
};

// Device groups — one entry per unique CPE
const SAMPLE_DEVICE_GROUPS = [
  // ── CT Scanner ──────────────────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:gehealthcare:brightspeed_elite_select:-:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "BrightSpeed Elite Select",
    version: "unknown",
  },
  // ── CT Acquisition Workstation Software ─────────────────────────────────────
  {
    cpe: "cpe:2.3:a:gehealthcare:advantage_workstation:4.6:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "Advantage Workstation",
    version: "4.6",
  },
  // ── PACS Server Software (versioned) ────────────────────────────────────────
  {
    cpe: "cpe:2.3:a:gehealthcare:centricity_pacs_iw:5.0:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "Centricity PACS-IW",
    version: "5.0",
  },
  // ── Radiology Diagnostic Workstation Software (viewer, unversioned) ──────────
  {
    cpe: "cpe:2.3:a:gehealthcare:centricity_pacs_iw:-:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "Centricity PACS-IW",
    version: "unknown",
  },
  // ── EOL OS platforms (exist for vulnerability targeting; no assets use these
  //    as primary CPE, but EternalBlue affectedDeviceGroups connects here too
  //    so seedIssues creates Issue records for all Windows hosts) ──────────────
  {
    cpe: "cpe:2.3:o:microsoft:windows_7:-:*:*:*:*:*:*:*",
    manufacturer: "Microsoft",
    modelName: "Windows 7",
    version: "EOL",
  },
  {
    cpe: "cpe:2.3:o:microsoft:windows_server_2008:r2:sp1:*:*:*:*:x64:*",
    manufacturer: "Microsoft",
    modelName: "Windows Server 2008 R2",
    version: "SP1 (EOL)",
  },
  // ── ED Image Viewer Hardware ─────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:dell:optiplex_790:-:*:*:*:*:*:*:*",
    manufacturer: "Dell",
    modelName: "OptiPlex 790",
    version: "N/A",
  },
  // ── Network / VPN Appliance ──────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:cisco:asa_5505:-:*:*:*:*:*:*:*",
    manufacturer: "Cisco",
    modelName: "ASA 5505",
    version: "N/A",
  },
  {
    cpe: "cpe:2.3:a:cisco:adaptive_security_appliance_software:8.2:*:*:*:*:*:*:*",
    manufacturer: "Cisco",
    modelName: "Adaptive Security Appliance Software",
    version: "8.2",
  },
  // ── Portable Ultrasound ──────────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:gehealthcare:logiq_e:r7:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "LOGIQ e R7",
    version: "R7",
  },
  // ── X-Ray / DR Node ─────────────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:gehealthcare:optima_xr200amx:-:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "Optima XR200amx",
    version: "N/A",
  },
  // ── Network Switch ───────────────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:cisco:catalyst_2960s-24ts-l:-:*:*:*:*:*:*:*",
    manufacturer: "Cisco",
    modelName: "Catalyst 2960S-24TS-L",
    version: "N/A",
  },
  // ── Patient Monitor ──────────────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:philips:intellivue_mp5:-:*:*:*:*:*:*:*",
    manufacturer: "Philips",
    modelName: "IntelliVue MP5",
    version: "N/A",
  },
  // ── Infusion Pump ────────────────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:baxter:sigma_spectrum:-:*:*:*:*:*:*:*",
    manufacturer: "Baxter",
    modelName: "Sigma Spectrum",
    version: "N/A",
  },
];

// Individual hospital assets
const SAMPLE_ASSETS = [
  // ── Imaging Devices (IMAGING-VLAN-40) ───────────────────────────────────────
  {
    id: "rad-ct-001",
    ip: "10.40.1.10",
    cpe: "cpe:2.3:h:gehealthcare:brightspeed_elite_select:-:*:*:*:*:*:*:*",
    role: "CT Scanner",
    upstreamApi: "https://www.gehealthcare.com/support",
    networkSegment: "IMAGING-VLAN-40",
    hostname: "CT-BRIGHT-001",
    macAddress: "00:1A:2B:3C:50:10",
    serialNumber: "GE-BS-2018-001",
    location: {
      building: "Imaging Department",
      room: "CT Suite",
    },
    status: "Active",
  },
  {
    id: "rad-us-001",
    ip: "10.40.1.30",
    cpe: "cpe:2.3:h:gehealthcare:logiq_e:r7:*:*:*:*:*:*:*",
    role: "Portable Ultrasound",
    upstreamApi: "https://www.gehealthcare.com/support",
    networkSegment: "IMAGING-VLAN-40",
    hostname: "US-LOGIQ-001",
    macAddress: "00:1A:2B:3C:50:30",
    serialNumber: "GE-LQ-2019-001",
    location: {
      building: "Imaging Department",
      room: "Ultrasound Bay 1",
    },
    status: "Active",
  },
  {
    id: "rad-us-002",
    ip: "10.40.1.31",
    cpe: "cpe:2.3:h:gehealthcare:logiq_e:r7:*:*:*:*:*:*:*",
    role: "Portable Ultrasound",
    upstreamApi: "https://www.gehealthcare.com/support",
    networkSegment: "IMAGING-VLAN-40",
    hostname: "US-LOGIQ-002",
    macAddress: "00:1A:2B:3C:50:31",
    serialNumber: "GE-LQ-2019-002",
    location: {
      building: "Imaging Department",
      room: "Ultrasound Bay 2",
    },
    status: "Active",
  },
  {
    id: "rad-xr-001",
    ip: "10.40.1.40",
    cpe: "cpe:2.3:h:gehealthcare:optima_xr200amx:-:*:*:*:*:*:*:*",
    role: "X-Ray / DR Node",
    upstreamApi: "https://www.gehealthcare.com/support",
    networkSegment: "IMAGING-VLAN-40",
    hostname: "XR-OPTIMA-001",
    macAddress: "00:1A:2B:3C:50:40",
    serialNumber: "GE-XR-2017-001",
    location: {
      building: "Imaging Department",
      room: "X-Ray Room",
    },
    status: "Active",
  },
  // CT Acquisition Workstation — HP Z800, Windows 7, Advantage Workstation 4.6
  {
    id: "rad-ws-001",
    ip: "10.40.1.20",
    cpe: "cpe:2.3:a:gehealthcare:advantage_workstation:4.6:*:*:*:*:*:*:*",
    role: "CT Acquisition Workstation",
    upstreamApi: "https://www.gehealthcare.com/support",
    networkSegment: "IMAGING-VLAN-40",
    hostname: "WS-ADVANTAGE-001",
    macAddress: "00:1A:2B:3C:50:20",
    serialNumber: "HP-Z800-2015-001",
    location: {
      building: "Imaging Department",
      room: "CT Control Room",
    },
    status: "Active",
    utilization: [
      // Monday — heavy day shift, light overnight
      {
        "7": 15,
        "8": 72,
        "9": 91,
        "10": 95,
        "11": 88,
        "12": 60,
        "13": 85,
        "14": 92,
        "15": 89,
        "16": 78,
        "17": 55,
        "18": 30,
        "19": 22,
        "20": 18,
        "21": 15,
        "22": 12,
        "23": 10,
      },
      // Tuesday
      {
        "7": 18,
        "8": 75,
        "9": 93,
        "10": 96,
        "11": 90,
        "12": 58,
        "13": 87,
        "14": 94,
        "15": 91,
        "16": 80,
        "17": 52,
        "18": 28,
        "19": 20,
        "20": 16,
        "21": 14,
        "22": 11,
        "23": 10,
      },
      // Wednesday
      {
        "7": 12,
        "8": 70,
        "9": 89,
        "10": 94,
        "11": 87,
        "12": 62,
        "13": 83,
        "14": 91,
        "15": 88,
        "16": 75,
        "17": 50,
        "18": 32,
        "19": 25,
        "20": 19,
        "21": 15,
        "22": 12,
        "23": 10,
      },
      // Thursday
      {
        "7": 16,
        "8": 74,
        "9": 92,
        "10": 95,
        "11": 89,
        "12": 61,
        "13": 86,
        "14": 93,
        "15": 90,
        "16": 77,
        "17": 53,
        "18": 29,
        "19": 21,
        "20": 17,
        "21": 14,
        "22": 11,
        "23": 9,
      },
      // Friday — slightly lighter afternoon
      {
        "7": 14,
        "8": 68,
        "9": 88,
        "10": 93,
        "11": 85,
        "12": 63,
        "13": 80,
        "14": 88,
        "15": 82,
        "16": 65,
        "17": 40,
        "18": 25,
        "19": 18,
        "20": 14,
        "21": 12,
        "22": 10,
        "23": 8,
      },
      // Saturday — reduced schedule, some overnight reads
      {
        "8": 35,
        "9": 55,
        "10": 62,
        "11": 58,
        "12": 45,
        "13": 40,
        "14": 38,
        "15": 30,
        "16": 22,
        "17": 18,
        "18": 20,
        "19": 22,
        "20": 24,
        "21": 22,
        "22": 18,
        "23": 15,
      },
      // Sunday — lightest day, mostly overnight on-call reads
      {
        "9": 28,
        "10": 42,
        "11": 48,
        "12": 40,
        "13": 32,
        "14": 28,
        "15": 22,
        "16": 18,
        "17": 20,
        "18": 22,
        "19": 25,
        "20": 28,
        "21": 26,
        "22": 20,
        "23": 16,
      },
    ],
  },
  // ── PACS & Radiology Workstations (PACS-VLAN-41) ────────────────────────────
  // PACS Server — Dell PowerEdge R710, Windows Server 2008 R2, Centricity PACS-IW v5.0
  {
    id: "rad-pacs-001",
    ip: "10.40.2.10",
    cpe: "cpe:2.3:a:gehealthcare:centricity_pacs_iw:5.0:*:*:*:*:*:*:*",
    role: "PACS Server",
    upstreamApi: "https://www.gehealthcare.com/support",
    networkSegment: "PACS-VLAN-41",
    hostname: "PACS-CENTRICITY-001",
    macAddress: "00:1A:2B:3C:51:10",
    serialNumber: "DL-R710-2014-001",
    location: {
      building: "IT Closet",
      room: "Server Rack 08",
    },
    status: "Active",
  },
  // Radiology Diagnostic Workstations — HP Z400, Windows 7, Centricity PACS-IW (viewer)
  {
    id: "rad-rws-001",
    ip: "10.40.2.20",
    cpe: "cpe:2.3:a:gehealthcare:centricity_pacs_iw:-:*:*:*:*:*:*:*",
    role: "Radiology Diagnostic Workstation",
    upstreamApi: "https://www.gehealthcare.com/support",
    networkSegment: "PACS-VLAN-41",
    hostname: "WS-RADIOLOGY-001",
    macAddress: "00:1A:2B:3C:51:20",
    serialNumber: "HP-Z400-2016-001",
    location: {
      building: "Imaging Department",
      room: "Radiology Reading Room",
    },
    status: "Active",
  },
  {
    id: "rad-rws-002",
    ip: "10.40.2.21",
    cpe: "cpe:2.3:a:gehealthcare:centricity_pacs_iw:-:*:*:*:*:*:*:*",
    role: "Radiology Diagnostic Workstation",
    upstreamApi: "https://www.gehealthcare.com/support",
    networkSegment: "PACS-VLAN-41",
    hostname: "WS-RADIOLOGY-002",
    macAddress: "00:1A:2B:3C:51:21",
    serialNumber: "HP-Z400-2016-002",
    location: {
      building: "Imaging Department",
      room: "Radiology Reading Room",
    },
    status: "Active",
  },
  // ── ED Image Viewer (ED-VLAN-50) ─────────────────────────────────────────────
  // Dell OptiPlex 790, Windows 7
  {
    id: "rad-ed-001",
    ip: "10.50.1.10",
    cpe: "cpe:2.3:h:dell:optiplex_790:-:*:*:*:*:*:*:*",
    role: "ED Image Viewer / Workstation",
    upstreamApi: "https://www.dell.com/support",
    networkSegment: "ED-VLAN-50",
    hostname: "WS-ED-VIEWER-001",
    macAddress: "00:1A:2B:3C:52:10",
    serialNumber: "DL-OP790-2013-001",
    location: {
      building: "Emergency Department",
      room: "ED Bay 5",
    },
    status: "Active",
  },
  // ── Network Infrastructure (INFRA-VLAN-70) ───────────────────────────────────
  // Remote Radiology VPN Gateway — Cisco ASA 5505, ASA OS 8.2
  {
    id: "rad-vpn-001",
    ip: "10.70.1.10",
    cpe: "cpe:2.3:h:cisco:asa_5505:-:*:*:*:*:*:*:*",
    role: "Remote Radiology VPN Gateway",
    upstreamApi: "https://www.cisco.com/c/en/us/support",
    networkSegment: "INFRA-VLAN-70",
    hostname: "VPN-ASA-001",
    macAddress: "00:1A:2B:3C:53:10",
    serialNumber: "CS-ASA5505-2013-001",
    location: {
      building: "IT Closet",
      room: "Network Rack",
    },
    status: "Active",
  },
  // Network Switch — Cisco Catalyst 2960S-24TS-L
  {
    id: "rad-sw-001",
    ip: "10.70.1.20",
    cpe: "cpe:2.3:h:cisco:catalyst_2960s-24ts-l:-:*:*:*:*:*:*:*",
    role: "Imaging Network Switch",
    upstreamApi: "https://www.cisco.com/c/en/us/support",
    networkSegment: "INFRA-VLAN-70",
    hostname: "SW-IMAGING-001",
    macAddress: "00:1A:2B:3C:53:20",
    serialNumber: "CS-C2960S-2015-001",
    location: {
      building: "IT Closet",
      room: "Network Rack",
    },
    status: "Active",
  },
  // Perimeter Firewall — Cisco ASA 5505, ASA OS 8.4
  {
    id: "rad-fw-001",
    ip: "10.70.1.1",
    cpe: "cpe:2.3:h:cisco:asa_5505:-:*:*:*:*:*:*:*",
    role: "Perimeter Firewall",
    upstreamApi: "https://www.cisco.com/c/en/us/support",
    networkSegment: "INFRA-VLAN-70",
    hostname: "FW-ASA-001",
    macAddress: "00:1A:2B:3C:53:01",
    serialNumber: "CS-ASA5505-2014-001",
    location: {
      building: "IT Closet",
      room: "Network Rack",
    },
    status: "Active",
  },
  // ── Patient Monitors — Philips IntelliVue MP5 ×13 (WARD-VLAN-20) ─────────────
  ...Array.from({ length: 13 }, (_, i) => ({
    id: `rad-mon-${String(i + 1).padStart(3, "0")}`,
    ip: `10.20.3.${101 + i}`,
    cpe: "cpe:2.3:h:philips:intellivue_mp5:-:*:*:*:*:*:*:*",
    role: "Patient Monitor",
    upstreamApi: "https://www.philips.com/a-w/about/support.html",
    networkSegment: "WARD-VLAN-20",
    hostname: `MON-MP5-${String(i + 1).padStart(3, "0")}`,
    macAddress: `00:1A:2B:3C:60:${(0x10 + i).toString(16).padStart(2, "0").toUpperCase()}`,
    serialNumber: `PH-MP5-2020-${String(i + 1).padStart(3, "0")}`,
    location: {
      building: "Medical-Surgical Unit",
      room: `Bed ${i + 1}`,
    },
    status: "Active",
  })),
  // ── Infusion Pumps — Baxter Sigma Spectrum ×23 (WARD-VLAN-20) ───────────────
  ...Array.from({ length: 23 }, (_, i) => ({
    id: `rad-pump-${String(i + 1).padStart(3, "0")}`,
    ip: `10.20.4.${101 + i}`,
    cpe: "cpe:2.3:h:baxter:sigma_spectrum:-:*:*:*:*:*:*:*",
    role: "Infusion Pump",
    upstreamApi:
      "https://www.baxter.com/healthcare-professionals/service-and-support",
    networkSegment: "WARD-VLAN-20",
    hostname: `PUMP-SIGMA-${String(i + 1).padStart(3, "0")}`,
    macAddress: `00:1A:2B:3C:61:${(0x10 + i).toString(16).padStart(2, "0").toUpperCase()}`,
    serialNumber: `BX-SS-2021-${String(i + 1).padStart(3, "0")}`,
    location: {
      building: "Medical-Surgical Unit",
      room: `Bed ${i + 1}`,
    },
    status: "Active",
  })),
];

// Vulnerabilities — cpes is an array to support multi-device-group linking
const SAMPLE_VULNERABILITIES = [
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
    upstreamApi:
      "https://www.cisa.gov/news-events/ics-medical-advisories/icsma-20-343-01",
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
    // groups so seedIssues() creates Issue records for every affected asset
    cpes: [
      "cpe:2.3:o:microsoft:windows_7:-:*:*:*:*:*:*:*",
      "cpe:2.3:o:microsoft:windows_server_2008:r2:sp1:*:*:*:*:x64:*",
      "cpe:2.3:a:gehealthcare:advantage_workstation:4.6:*:*:*:*:*:*:*",
      "cpe:2.3:a:gehealthcare:centricity_pacs_iw:5.0:*:*:*:*:*:*:*",
      "cpe:2.3:a:gehealthcare:centricity_pacs_iw:-:*:*:*:*:*:*:*",
      "cpe:2.3:h:dell:optiplex_790:-:*:*:*:*:*:*:*",
    ],
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2017-0144",
    upstreamApi:
      "https://support.microsoft.com/en-us/topic/ms17-010-security-update-for-windows-smb-server-814d78c1-a11d-e4c8-d52a-f41a41b5d238",
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
    upstreamApi:
      "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-20160817-asa-snmp",
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
    upstreamApi:
      "https://www.baxter.com/healthcare-professionals/service-and-support",
    description:
      "Buffer overflow in the wireless management interface of Baxter Sigma Spectrum infusion pumps running firmware versions prior to 8.x allows an attacker on the same wireless segment to execute arbitrary code or crash the device via crafted management packets. All 23 Sigma Spectrum pumps on WARD-VLAN-20 are running the vulnerable firmware (v1.2.3).",
    narrative:
      "The Baxter Sigma Spectrum pump fleet on the medical-surgical floor is running firmware v1.2.3, which contains a buffer overflow in the wireless management interface. An attacker with access to WARD-VLAN-20 can send crafted management packets to crash a pump or execute code in the pump's control context. Baxter has issued an updated firmware release that addresses the vulnerability, but each pump must be taken out of service, updated, and clinically validated before being returned to patient use.",
    impact:
      "A successful exploit could cause a pump to crash mid-infusion, interrupting medication delivery to a patient. In the worst case, code execution could allow an attacker to alter infusion parameters (rate, volume, dose) — a direct patient-safety risk for any patient on continuous IV medication. With all 23 pumps running the vulnerable firmware, a worm-style attack could disable the entire medical-surgical infusion fleet simultaneously.",
  },
];

const SAMPLE_MEMORIES = [
  {
    content:
      "The hospital is a rural, critical access hospital with 12 inpatient beds.",
  },
  {
    content:
      "If applying a patch to an OT device, unless it has already been tested by the vendor, the device should be validated after patching to ensure that its essential clinical functionality hasn't been compromised. This process can often be time intensive and should be accounted for as applicable in remediation recommendations.",
  },
];

// Add device artifacts here as needed in the future
const SAMPLE_DEVICE_ARTIFACTS: {
  role: string;
  cpe: string;
  dockerUrl?: string;
  downloadUrl?: string;
  description: string;
}[] = [];

// Remediations matched to seed vulnerability CPEs
const SAMPLE_REMEDIATIONS = [
  // CVE-2020-25175 remediation for GE BrightSpeed Elite Select
  {
    cpe: "cpe:2.3:h:gehealthcare:brightspeed_elite_select:-:*:*:*:*:*:*:*",
    fixUri:
      "https://www.cisa.gov/news-events/ics-medical-advisories/icsma-20-343-01",
    description:
      "Apply GE Healthcare ICS security controls per CISA advisory ICSMA-20-343-01 and GE Security Bulletin GE-2020-004 to mitigate credential exposure on imaging devices (CVE-2020-25175).",
    narrative:
      "Work with GE Healthcare Biomedical/Clinical Engineering to apply mitigations from GE Security Bulletin GE-2020-004. Immediately isolate all affected GE imaging devices (CT scanner, ultrasound units, X-ray node) to a dedicated DICOM VLAN with strict ACLs permitting only DICOM traffic (port 104/TCP) to and from the PACS server. Disable unnecessary network services on each device via GE service mode. Request firmware update availability from your GE account representative. Deploy IDS/IPS monitoring on the DICOM VLAN to detect anomalous credential-bearing traffic. Post-remediation: verify DICOM connectivity to PACS and confirm the imaging workflow is unaffected.",
    upstreamApi: "https://www.gehealthcare.com/security",
  },
  // CVE-2017-0144 remediation for CT Acquisition Workstation (Windows 7 / EOL host)
  {
    cpe: "cpe:2.3:a:gehealthcare:advantage_workstation:4.6:*:*:*:*:*:*:*",
    fixUri:
      "https://support.microsoft.com/en-us/topic/ms17-010-security-update-for-windows-smb-server-814d78c1-a11d-e4c8-d52a-f41a41b5d238",
    description:
      "Windows 7 and Server 2008 R2 are end-of-life and do not receive patches via standard Windows Update. Apply MS17-010 via Microsoft extended support if contracted, then implement network-level compensating controls to mitigate EternalBlue (CVE-2017-0144) across all five imaging network Windows hosts.",
    narrative:
      "Immediate actions: (1) Disable SMBv1 on all five affected hosts via PowerShell (Set-SmbServerConfiguration -EnableSMB1Protocol $false) and registry (HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters, SMB1=0). (2) Block TCP port 445 inbound at the Cisco Catalyst 2960S switch using ACLs on all imaging and PACS VLANs. (3) Deploy host-based firewall rules to block SMB from non-management hosts. (4) Micro-segment each workstation subnet to minimize lateral movement. Long-term: coordinate with GE Healthcare to plan migration of CT acquisition workstation and PACS server to a supported OS — Advantage Workstation 4.6 and Centricity PACS-IW 5.0 compatibility with newer Windows versions must be confirmed with the vendor before upgrading.",
    upstreamApi: "https://www.microsoft.com/en-us/windows/end-of-support",
  },
  // CVE-2016-6366 remediation for Cisco ASA 5505 (both VPN gateway and firewall)
  {
    cpe: "cpe:2.3:h:cisco:asa_5505:-:*:*:*:*:*:*:*",
    fixUri:
      "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-20160817-asa-snmp",
    description:
      "Upgrade Cisco ASA 5505 software from 8.2.x to a patched release (9.1(7.21) or later) per Cisco Security Advisory cisco-sa-20160817-asa-snmp to remediate the EXTRABACON SNMP buffer overflow (CVE-2016-6366). Applies to both the remote radiology VPN gateway and the perimeter firewall.",
    narrative:
      "Both ASA 5505 appliances must be upgraded. Cisco ASA 5505 supports ASA software up to 9.2(x); upgrade to 9.1(7.21)+ or the latest available 9.2.x release. Before upgrading: back up ASA configuration (copy running-config tftp://...), test rollback procedure in a change window. Schedule separate maintenance windows for each device — perimeter firewall first (~30 min downtime), then VPN gateway (coordinate with remote radiology team to minimize after-hours coverage gap). If an immediate upgrade cannot be scheduled: switch from SNMPv2c to SNMPv3 with authentication and encryption, or restrict SNMP community access via ACL to the management VLAN only. Post-upgrade: verify VPN tunnels for remote radiologist access, confirm firewall policy enforcement, and validate DICOM routing.",
    upstreamApi:
      "https://www.cisco.com/c/en/us/support/security/asa-5500-series-next-generation-firewalls/series.html",
  },
];

const SAMPLE_DEPARTMENTS = [
  {
    name: "Radiology",
    description:
      "Imaging department — CT, PACS, ultrasound, X-ray, reading rooms.",
    color: "purple",
  },
  {
    name: "Emergency Department",
    description: "ED clinical operations, including the bedside image viewer.",
    color: "red",
  },
  {
    name: "Biomed",
    description:
      "Medical device lifecycle — patient monitors, infusion pumps, validation.",
    color: "orange",
  },
  {
    name: "Biotech",
    description: "Biotechnology research and lab operations.",
    color: "yellow",
  },
  {
    name: "Nursing",
    description: "Ward operations on the medical-surgical floor.",
    color: "pink",
  },
  {
    name: "IT",
    description: "Network, firewall, VPN, identity, and security operations.",
    color: "blue",
  },
  {
    name: "Procurement",
    description: "Capital equipment sourcing and vendor management.",
    color: "blue",
  },
  {
    name: "Administration",
    description: "Hospital leadership and compliance oversight.",
    color: "slate",
  },
];

const SAMPLE_CATEGORY_COLORS: { category: TicketCategory; color: string }[] = [
  { category: TicketCategory.PATCH, color: "blue" },
  { category: TicketCategory.CONFIG_CHANGE, color: "purple" },
  { category: TicketCategory.VULN_REMEDIATION, color: "red" },
  { category: TicketCategory.ADVISORY_RESPONSE, color: "amber" },
  { category: TicketCategory.CLINICAL_REVIEW, color: "pink" },
  { category: TicketCategory.FIRMWARE_UPDATE, color: "orange" },
  { category: TicketCategory.NETWORK_REMEDIATION, color: "blue" },
  { category: TicketCategory.NEW_ASSET_PROCUREMENT, color: "purple" },
  { category: TicketCategory.OTHER, color: "slate" },
];

const SEED_USER_DEPARTMENT = "IT";

type SampleTicket = {
  summary: string;
  // Default body, applied to the primary department when no per-department
  // override exists in `descriptionsByDepartment`.
  description?: string;
  // Per-department description bodies, keyed by department name. Overrides
  // `description` for any matching department; departments that appear here
  // but not in `department`/`departments` are ignored.
  descriptionsByDepartment?: Record<string, string>;
  status: TicketStatus;
  category: TicketCategory;
  // Single primary department or an ordered list — first entry is "primary"
  // for the purpose of the default `description` fallback.
  department: string | string[];
  source: TicketSource;
  sourceLabel?: string;
  scheduledAt?: Date;
  linkedCveIds?: string[];
  linkedAssetIds?: string[];
  comments?: string[];
  // When true, the seed user's "last seen" is stamped *before* the comment
  // activity, so the ticket renders with the unread-comments indicator. When
  // false/omitted (and the ticket has comments) it's stamped *after*, i.e.
  // already read. Tickets without comments never show the indicator.
  commentsUnread?: boolean;
};

type SampleParentTicket = SampleTicket & { children?: SampleTicket[] };

// Tickets generated against the seed vulnerabilities/assets/workflows above.
// Scheduled dates are relative to seed run; relative offsets are computed below.
const dayMs = 24 * 60 * 60 * 1000;
const now = Date.now();
const inDays = (n: number) => new Date(now + n * dayMs);

const SAMPLE_CHANGE_TICKETS: SampleParentTicket[] = [
  {
    summary: "Update Baxter Infusion Pumps Firmware",
    status: TicketStatus.IN_PROGRESS,
    category: TicketCategory.FIRMWARE_UPDATE,
    department: ["Biomed", "Nursing"],
    descriptionsByDepartment: {
      Biomed:
        "Baxter Sigma Spectrum infusion pumps are running firmware version 1.2.3, which is vulnerable to CVE-2021-12345 (hypothetical buffer overflow). Update all 23 pumps to firmware 1.4.0 from the Baxter support portal. Validate dose-error reduction software (DERS) library integrity and channel-to-channel concentration calculations on each pump post-update before returning to clinical use.",
      Nursing:
        "Infusion pumps in your unit will be pulled for firmware updates in rolling batches of ~4 pumps at a time, by floor. Biomed will deliver swap pumps before pulling each batch — no expected interruption to active infusions, but please verify any in-progress drips are re-programmed on the swap pump and document the channel hand-off in the MAR. Escalate to charge nurse if Biomed can't supply a swap before pulling a pump.",
    },
    source: TicketSource.MANUAL,
    linkedCveIds: ["CVE-2021-12345"],
    linkedAssetIds: Array.from(
      { length: 23 },
      (_, i) => `rad-pump-${String(i + 1).padStart(3, "0")}`,
    ),
    comments: ["Firmware update available from Baxter support portal."],
    commentsUnread: true,
    children: [
      {
        summary: "Update firmware on ICU pumps (4 devices)",
        description:
          "Schedule update for pumps in ICU first, coordinate with nursing to minimize disruption.",
        status: TicketStatus.DONE,
        category: TicketCategory.FIRMWARE_UPDATE,
        department: "Biomed",
        source: TicketSource.MANUAL,
        linkedCveIds: ["CVE-2021-12345"],
        linkedAssetIds: [
          "rad-pump-001",
          "rad-pump-002",
          "rad-pump-003",
          "rad-pump-004",
        ],
        comments: [
          "Completed on 2026-05-15; validated pump functionality post-update.",
        ],
      },
      {
        summary: "Update firmware on ER pumps (3 devices)",
        description:
          "Schedule update for pumps in ER next, coordinate with nursing to minimize disruption.",
        status: TicketStatus.IN_PROGRESS,
        category: TicketCategory.FIRMWARE_UPDATE,
        department: "Biomed",
        source: TicketSource.MANUAL,
        linkedCveIds: ["CVE-2021-12345"],
        linkedAssetIds: ["rad-pump-005", "rad-pump-006", "rad-pump-007"],
        comments: ["Pending Biomed review and scheduling."],
        commentsUnread: true,
      },
      {
        summary: "Update firmware on Surgery pumps (3 devices)",
        description:
          "Schedule update for pumps in Surgery next, coordinate with nursing to minimize disruption.",
        status: TicketStatus.TO_DO,
        category: TicketCategory.FIRMWARE_UPDATE,
        department: "Biomed",
        source: TicketSource.MANUAL,
        linkedCveIds: ["CVE-2021-12345"],
        linkedAssetIds: ["rad-pump-008", "rad-pump-009", "rad-pump-010"],
      },
    ],
  },
  {
    summary:
      "Remediate EternalBlue (CVE-2017-0144) across EOL Windows imaging hosts",
    status: TicketStatus.IN_PROGRESS,
    category: TicketCategory.VULN_REMEDIATION,
    department: ["Radiology", "IT", "Administration"],
    descriptionsByDepartment: {
      Radiology:
        "Five hosts in the imaging chain — the CT acquisition workstation, the PACS server, two diagnostic reading workstations, and the ED bedside viewer — are EOL Windows 7 / Server 2008 R2 and vulnerable to MS17-010. Each will be touched on its own schedule to keep at least one diagnostic workstation online at all times. Expect a brief read interruption (under 5 minutes) per workstation; PACS work will run in a dedicated overnight maintenance window with CMO sign-off.",
      IT: "SMBv1 disablement on each host (registry + reboot), plus network-level compensating controls: ACL blocking TCP/445 across the imaging and PACS VLANs, and a DICOM-only VLAN ACL to limit blast radius. ASA configs were backed up before any change. Track per-host workstreams in the child tickets; the network-level controls are already deployed and verified by packet capture.",
      Administration:
        "Imaging-chain EternalBlue remediation. Compliance-relevant: EOL OS exposure on patient-facing systems. PACS server change requires CMO sign-off (separate child ticket) due to imaging chain blast radius. Expected aggregate downtime across all hosts: under 30 minutes during business hours, plus a single overnight maintenance window for PACS.",
    },
    source: TicketSource.INTEGRATION,
    sourceLabel: "TriMedX RSQ",
    linkedCveIds: ["CVE-2017-0144"],
    linkedAssetIds: [
      "rad-ws-001",
      "rad-pacs-001",
      "rad-rws-001",
      "rad-rws-002",
      "rad-ed-001",
    ],
    comments: [
      "Tracking five hosts + two compensating controls. Final verify lands once PACS patch is approved.",
    ],
    children: [
      {
        summary: "Disable SMBv1 on CT Acquisition Workstation (rad-ws-001)",
        description:
          "Mitigates EternalBlue on the EOL Windows 7 host. Coordinate with Radiology — workstation is on the Emergency CT path.",
        status: TicketStatus.TO_DO,
        category: TicketCategory.CONFIG_CHANGE,
        department: "Radiology",
        source: TicketSource.INTEGRATION,
        sourceLabel: "TriMedX RSQ",
        linkedCveIds: ["CVE-2017-0144"],
        linkedAssetIds: ["rad-ws-001"],
        comments: [
          "Life-safety path: confirm fallback procedure before rollout.",
          "Vendor compat check pending with GE for Advantage Workstation 4.6.",
        ],
      },
      {
        summary: "Patch PACS Server EternalBlue (rad-pacs-001)",
        description:
          "PACS server is on EOL Windows Server 2008 R2. Apply MS17-010 via extended support or disable SMBv1 + block 445 at the switch. Affects the entire imaging workflow.",
        status: TicketStatus.REQUIRES_APPROVAL,
        category: TicketCategory.VULN_REMEDIATION,
        department: "Radiology",
        source: TicketSource.EMAIL,
        sourceLabel: "security@hospital.example.org",
        scheduledAt: inDays(10),
        linkedCveIds: ["CVE-2017-0144"],
        linkedAssetIds: ["rad-pacs-001"],
        comments: [
          "Awaiting CMO sign-off — full imaging chain outage if this goes sideways.",
        ],
      },
      {
        summary: "Disable SMBv1 on Radiology Diagnostic Workstations",
        description:
          "Apply SMBv1 disablement to rad-rws-001 and rad-rws-002 in tandem so radiologist coverage isn't interrupted.",
        status: TicketStatus.IN_PROGRESS,
        category: TicketCategory.CONFIG_CHANGE,
        department: "Radiology",
        source: TicketSource.MANUAL,
        scheduledAt: inDays(1),
        linkedCveIds: ["CVE-2017-0144"],
        linkedAssetIds: ["rad-rws-001", "rad-rws-002"],
        comments: ["rws-001 done; rws-002 scheduled for tonight."],
      },
      {
        summary: "Block TCP/445 at imaging switch (rad-sw-001)",
        status: TicketStatus.DONE,
        category: TicketCategory.CONFIG_CHANGE,
        department: ["IT", "Radiology"],
        descriptionsByDepartment: {
          IT: "Network-level compensating control for EternalBlue on EOL Windows hosts. ACL deployed on imaging and PACS VLANs blocking inbound TCP/445 except from the management VLAN. Verified by packet capture post-deployment.",
          Radiology:
            "Networking change on the imaging switch shouldn't be visible from any reading workstation — DICOM traffic (104/TCP) is unaffected. If you see new failures sending studies to PACS or pulling priors, flag IT immediately; we ran post-deploy validation but want eyes on it for the first 48 hours.",
        },
        source: TicketSource.MANUAL,
        scheduledAt: inDays(-9),
        linkedCveIds: ["CVE-2017-0144"],
        linkedAssetIds: ["rad-sw-001"],
        comments: ["Work order ticket CHG-2207 closed; pending verification."],
      },
      {
        summary: "Verify DICOM VLAN ACL enforcement",
        description:
          "Validate post-deployment that only DICOM (104/TCP) is permitted between imaging devices and PACS.",
        status: TicketStatus.DONE,
        category: TicketCategory.CONFIG_CHANGE,
        department: "IT",
        source: TicketSource.MANUAL,
        scheduledAt: inDays(-6),
        linkedCveIds: ["CVE-2020-25175"],
        linkedAssetIds: ["rad-pacs-001", "rad-sw-001"],
        comments: ["Validated via packet capture on 2026-05-21."],
      },
    ],
  },
  {
    summary: "GE Imaging Device Hardening (CVE-2020-25175)",
    commentsUnread: true,
    description:
      "Umbrella ticket for credential-exposure mitigations across GE BrightSpeed CT, LOGIQ e ultrasounds, and Optima XR200amx per CISA ICSMA-20-343-01.",
    status: TicketStatus.TO_DO,
    category: TicketCategory.VULN_REMEDIATION,
    department: "Radiology",
    source: TicketSource.INTEGRATION,
    sourceLabel: "TriMedX RSQ",
    linkedCveIds: ["CVE-2020-25175"],
    linkedAssetIds: ["rad-ct-001", "rad-us-001", "rad-us-002", "rad-xr-001"],
    comments: [
      "Proposed by workflow after AI.PatchRead flagged credential exposure on the DICOM VLAN.",
    ],
    children: [
      {
        summary: "Isolate GE imaging devices to a dedicated DICOM VLAN",
        description:
          "Per CISA ICSMA-20-343-01, isolate the BrightSpeed CT, both LOGIQ e ultrasounds, and the Optima XR200amx onto a DICOM-only VLAN with strict ACLs. Coordinate with Biomed for post-change DICOM validation.",
        status: TicketStatus.TO_DO,
        category: TicketCategory.CONFIG_CHANGE,
        department: "Radiology",
        source: TicketSource.INTEGRATION,
        sourceLabel: "TriMedX RSQ",
        linkedCveIds: ["CVE-2020-25175"],
        linkedAssetIds: [
          "rad-ct-001",
          "rad-us-001",
          "rad-us-002",
          "rad-xr-001",
        ],
      },
    ],
  },
  {
    summary: "Cisco ASA EXTRABACON Upgrades (CVE-2016-6366)",
    status: TicketStatus.REQUIRES_APPROVAL,
    category: TicketCategory.PATCH,
    department: ["IT", "Administration"],
    descriptionsByDepartment: {
      IT: "Upgrade both ASA 5505 appliances (perimeter firewall + remote radiology VPN gateway) from 8.2 to a patched 9.1(7.21) release. Separate maintenance windows: perimeter firewall first (~30 min downtime, business-impact: external traffic suspended), then VPN gateway (coordinate with remote radiology — after-hours read coverage gap). Pre-stage backup configs; test rollback procedure in a change window before production. If immediate upgrade can't be scheduled, switch SNMPv2c → SNMPv3 with auth+encryption or restrict community access via ACL to the management VLAN.",
      Administration:
        "EXTRABACON remote-code-execution exposure on perimeter firewall. Patient impact: minimal during business hours (~30 min internet outage); after-hours remote radiology read coverage may be briefly interrupted during VPN upgrade. Recommend approving the staggered upgrade plan from IT. Risk if deferred: known SNMP RCE exploit chain against an internet-facing device.",
    },
    source: TicketSource.MANUAL,
    linkedCveIds: ["CVE-2016-6366"],
    linkedAssetIds: ["rad-fw-001", "rad-vpn-001"],
    children: [
      {
        summary: "Upgrade Perimeter Firewall ASA 8.2 → 9.1(7.21)",
        description:
          "SNMP RCE on ASA 8.x. Upgrade rad-fw-001 to a patched 9.1.x release in a maintenance window.",
        status: TicketStatus.REQUIRES_APPROVAL,
        category: TicketCategory.PATCH,
        department: "IT",
        source: TicketSource.MANUAL,
        scheduledAt: inDays(7),
        linkedCveIds: ["CVE-2016-6366"],
        linkedAssetIds: ["rad-fw-001"],
        comments: ["~30 min downtime expected; backup config staged."],
      },
      {
        summary: "Upgrade Cisco ASA VPN gateway (rad-vpn-001)",
        description:
          "Coordinate with remote radiology coverage. Upgrade ASA 8.2 → 9.1.x to remediate EXTRABACON.",
        status: TicketStatus.IN_PROGRESS,
        category: TicketCategory.PATCH,
        department: "IT",
        source: TicketSource.EMAIL,
        sourceLabel: "security@hospital.example.org",
        scheduledAt: inDays(3),
        linkedCveIds: ["CVE-2016-6366"],
        linkedAssetIds: ["rad-vpn-001"],
      },
    ],
  },
  {
    summary: "Patient Device Roadmap",
    description:
      "Tracks longer-horizon decisions for patient monitor and infusion pump fleets — vendor engagement, fleet refresh planning.",
    status: TicketStatus.TO_DO,
    category: TicketCategory.OTHER,
    department: "Biomed",
    source: TicketSource.MANUAL,
    children: [
      {
        summary: "Investigate IntelliVue MP5 firmware update availability",
        description:
          "Open ticket with Philips on patient monitor firmware roadmap and known vulns.",
        status: TicketStatus.TO_DO,
        category: TicketCategory.OTHER,
        department: "Biomed",
        source: TicketSource.MANUAL,
        linkedAssetIds: Array.from(
          { length: 13 },
          (_, i) => `rad-mon-${String(i + 1).padStart(3, "0")}`,
        ),
      },
      {
        summary: "Replace Baxter Sigma Spectrum infusion pumps",
        description:
          "Proposed full fleet replacement deferred — out-of-budget this FY. Revisit in next capital cycle.",
        status: TicketStatus.DONE,
        category: TicketCategory.OTHER,
        department: "Biomed",
        source: TicketSource.MANUAL,
        linkedAssetIds: Array.from(
          { length: 23 },
          (_, i) => `rad-pump-${String(i + 1).padStart(3, "0")}`,
        ),
        comments: ["Deferred per Admin — revisit FY27 capital plan."],
      },
    ],
  },
];

async function clearDatabase() {
  console.log("🗑️  Clearing database...");

  // Tickets first — they reference assets/vulns/remediations/advisories/workflows/users.
  // Comments and descriptions cascade with their parent ticket; the implicit
  // m2m join rows cascade too.
  await prisma.ticketComment.deleteMany();
  await prisma.ticketDescription.deleteMany();
  await prisma.workOrderTicket.deleteMany();
  // Workflows cascade to Node and Connection
  await prisma.workflow.deleteMany();
  // Delete in order of dependencies (child tables first)
  await prisma.issue.deleteMany();
  await prisma.syncStatus.deleteMany();
  await prisma.externalAssetMapping.deleteMany();
  await prisma.externalVulnerabilityMapping.deleteMany();
  await prisma.artifact.deleteMany();
  await prisma.artifactWrapper.deleteMany();
  await prisma.remediation.deleteMany();
  await prisma.vulnerability.deleteMany();
  await prisma.deviceArtifact.deleteMany();
  await prisma.deviceGroupHistory.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.deviceGroup.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.memory.deleteMany();
  await prisma.categoryColor.deleteMany();
  await prisma.department.deleteMany();

  console.log("✅ Database cleared");
}

async function createOrGetSeedUser() {
  console.log("\n👤 Creating/finding seed user...");

  let user = await prisma.user.findUnique({
    where: { email: SEED_USER.email },
  });

  if (user) {
    console.log(`✅ Seed user already exists: ${SEED_USER.email}`);
    return user;
  }

  const hashedPassword = await hashPassword(SEED_USER.password);

  user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: SEED_USER.email,
      name: SEED_USER.name,
      emailVerified: true,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: SEED_USER.email,
          providerId: "credential",
          password: hashedPassword,
        },
      },
    },
  });

  console.log(`✅ Created seed user: ${SEED_USER.email}`);
  return user;
}

// "unknown"/"EOL"-style sentinels and CPE wildcards map to a null (unknown) version.
function normalizeVersion(v?: string | null): string | null {
  if (!v || v === "unknown" || v === "-" || v === "*") return null;
  return v;
}

// Mirror of router-utils' CPE-token → versionStatus mapping so seeded device
// groups carry the same semantics as ones resolved from CPEs at runtime:
// "-" => NOT_APPLICABLE, "*"/empty => UNKNOWN, any value => KNOWN.
function cpeVersionStatus(cpe: string): "UNKNOWN" | "NOT_APPLICABLE" | "KNOWN" {
  const token = cpe.split(":")[5] ?? "";
  if (token === "-") return "NOT_APPLICABLE";
  if (token === "" || token === "*") return "UNKNOWN";
  return "KNOWN";
}

// Canonical resolvers (seed avoids importing the server-only router-utils).
// canonicalName is @unique so upsert is race-safe.
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

type GroupIdentity = {
  vendorId: string | null;
  productId: string | null;
  versionId: string | null;
};

// Local mirror of matchingAppliesToDeviceGroup's applicability test (id-based).
function matchingMatchesGroup(m: GroupIdentity, dg: GroupIdentity): boolean {
  if (!dg.vendorId || m.vendorId !== dg.vendorId) return false;
  if (m.productId && m.productId !== dg.productId) return false;
  if (m.versionId && m.versionId !== dg.versionId) return false;
  return true;
}

async function seedDeviceGroups() {
  console.log("\n🌱 Seeding device groups...");

  // Sequential to keep find-or-create of the (vendor, product, version) identity
  // race-free.
  const deviceGroups = [];
  for (const dg of SAMPLE_DEVICE_GROUPS) {
    const vendor = await upsertVendor(dg.manufacturer);
    const product = await upsertProduct(dg.modelName);
    // versionStatus follows the CPE's version token; only KNOWN groups get a
    // version row (NOT_APPLICABLE / UNKNOWN groups have versionId = null).
    const versionStatus = cpeVersionStatus(dg.cpe);
    const versionName =
      versionStatus === "KNOWN"
        ? (normalizeVersion(dg.version) ?? dg.cpe.split(":")[5])
        : null;
    const version = versionName ? await upsertVersion(versionName) : null;

    const existing = await prisma.deviceGroup.findFirst({
      where: {
        vendorId: vendor.id,
        productId: product.id,
        versionId: version?.id ?? null,
        versionStatus,
      },
    });

    const group =
      existing ??
      (await prisma.deviceGroup.create({
        data: {
          vendorId: vendor.id,
          productId: product.id,
          versionId: version?.id ?? null,
          versionStatus,
          cpe: [dg.cpe],
        },
      }));

    if (existing && !existing.cpe.includes(dg.cpe)) {
      await prisma.deviceGroup.update({
        where: { id: group.id },
        data: { cpe: [...existing.cpe, dg.cpe] },
      });
    }

    deviceGroups.push(group);
  }

  console.log(`✅ Seeded ${deviceGroups.length} device groups`);
  return deviceGroups;
}

async function seedAssets(userId: string) {
  console.log("\n🌱 Seeding assets...");

  const assets = await Promise.all(
    SAMPLE_ASSETS.map(async (asset) => {
      const deviceGroup = await prisma.deviceGroup.findFirst({
        where: { cpe: { has: asset.cpe } },
      });

      if (!deviceGroup) {
        console.warn(`⚠️  No device group found for CPE: ${asset.cpe}`);
        return null;
      }

      return prisma.asset.upsert({
        where: {
          id: "id" in asset && asset.id ? asset.id : "-1",
        },
        update: {},
        create: {
          ...("id" in asset && asset.id ? { id: asset.id } : {}),
          ip: asset.ip,
          networkSegment: asset.networkSegment,
          role: asset.role,
          upstreamApi: asset.upstreamApi,
          hostname: asset.hostname,
          macAddress: asset.macAddress,
          serialNumber: asset.serialNumber,
          location: asset.location,
          status: asset.status as AssetStatus,
          utilization: asset.utilization,
          deviceGroupId: deviceGroup.id,
          userId,
        },
      });
    }),
  );

  const successfulAssets = assets.filter((a) => a !== null);
  console.log(`✅ Seeded ${successfulAssets.length} assets`);
  return successfulAssets;
}

// Find-or-create a shared DeviceGroupMatching for a device-group identity.
async function matchingForGroup(dg: GroupIdentity): Promise<string | null> {
  if (!dg.vendorId) return null;
  const where = {
    vendorId: dg.vendorId,
    productId: dg.productId,
    versionId: dg.versionId,
    versionRange: null,
  };
  const existing = await prisma.deviceGroupMatching.findFirst({ where });
  const matching =
    existing ?? (await prisma.deviceGroupMatching.create({ data: where }));
  return matching.id;
}

async function seedVulnerabilities(userId: string) {
  console.log("\n🌱 Seeding vulnerabilities...");

  // Sequential so shared DeviceGroupMatching find-or-create is race-free.
  const vulnerabilities = [];
  for (const vulnerability of SAMPLE_VULNERABILITIES) {
    const { cpes, ...data } = vulnerability;

    const deviceGroups = (
      await Promise.all(
        cpes.map((cpe) =>
          prisma.deviceGroup.findFirst({
            where: { cpe: { has: cpe } },
            select: {
              id: true,
              vendorId: true,
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

    const created = await prisma.vulnerability.create({
      data: {
        ...data,
        userId,
        deviceGroupMatchings: {
          connect: matchingIds.map((id) => ({ id })),
        },
      },
    });
    vulnerabilities.push(created);
  }

  console.log(`✅ Seeded ${vulnerabilities.length} vulnerabilities`);
  return vulnerabilities;
}

async function seedDeviceArtifacts(userId: string) {
  console.log("\n🌱 Seeding device artifacts...");

  const deviceArtifacts = await Promise.all(
    SAMPLE_DEVICE_ARTIFACTS.map(async (deviceArtifact) => {
      // Resolve the artifact's identity (the device it's for) from its CPE.
      const parts = deviceArtifact.cpe.split(":");
      const norm = (v?: string) => (!v || v === "-" || v === "*" ? null : v);
      const vendor = await upsertVendor(norm(parts[3]) ?? "-");
      const product = await upsertProduct(norm(parts[4]) ?? "-");
      const versionName = norm(parts[5]);
      const version = versionName ? await upsertVersion(versionName) : null;
      const identityMatchingId = await matchingForGroup({
        vendorId: vendor.id,
        productId: product.id,
        versionId: version?.id ?? null,
      });

      const createdDeviceArtifact = await prisma.deviceArtifact.create({
        data: {
          role: deviceArtifact.role,
          description: deviceArtifact.description,
          deviceGroupMatchings: identityMatchingId
            ? { connect: { id: identityMatchingId } }
            : undefined,
          userId,
        },
      });

      const wrapper = await prisma.artifactWrapper.create({
        data: {
          deviceArtifactId: createdDeviceArtifact.id,
          userId,
        },
      });

      const artifacts = [];

      if (deviceArtifact.dockerUrl) {
        const dockerArtifact = await prisma.artifact.create({
          data: {
            wrapperId: wrapper.id,
            name: "Docker Image",
            artifactType: "Emulator" as ArtifactType,
            downloadUrl: deviceArtifact.dockerUrl,
            versionNumber: 1,
            userId,
          },
        });
        artifacts.push(dockerArtifact);
      }

      if (deviceArtifact.downloadUrl) {
        const downloadArtifact = await prisma.artifact.create({
          data: {
            wrapperId: wrapper.id,
            name: "Download",
            artifactType: "Emulator" as ArtifactType,
            downloadUrl: deviceArtifact.downloadUrl,
            versionNumber: 1,
            userId,
          },
        });
        artifacts.push(downloadArtifact);
      }

      if (artifacts.length > 0) {
        await prisma.artifactWrapper.update({
          where: { id: wrapper.id },
          data: {
            latestArtifactId: artifacts[artifacts.length - 1].id,
          },
        });
      }

      return createdDeviceArtifact;
    }),
  );

  const successfulDeviceArtifacts = deviceArtifacts.filter((da) => da !== null);
  console.log(`✅ Seeded ${successfulDeviceArtifacts.length} device artifacts`);
  return successfulDeviceArtifacts;
}

async function seedRemediations(userId: string) {
  console.log("\n🌱 Seeding remediations...");

  const remediations = await Promise.all(
    SAMPLE_REMEDIATIONS.map(async (remediation) => {
      const deviceGroup = await prisma.deviceGroup.findFirst({
        where: { cpe: { has: remediation.cpe } },
      });

      if (!deviceGroup) {
        console.warn(`⚠️  No device group found for CPE: ${remediation.cpe}`);
        return null;
      }

      // Link the remediation to the device group via its own matching, and to
      // the vulnerability that affects the same group.
      const matchingId = await matchingForGroup({
        vendorId: deviceGroup.vendorId,
        productId: deviceGroup.productId,
        versionId: deviceGroup.versionId,
      });

      const vulnerability = await prisma.vulnerability.findFirst({
        where: {
          deviceGroupMatchings: {
            some: {
              vendorId: deviceGroup.vendorId ?? undefined,
              productId: deviceGroup.productId,
            },
          },
        },
      });

      if (!vulnerability) {
        console.warn(`⚠️  No vulnerability found for CPE: ${remediation.cpe}`);
        return null;
      }

      const createdRemediation = await prisma.remediation.create({
        data: {
          description: remediation.description,
          narrative: remediation.narrative,
          upstreamApi: remediation.upstreamApi,
          vulnerabilityId: vulnerability.id,
          deviceGroupMatchings: matchingId
            ? { connect: { id: matchingId } }
            : undefined,
          userId,
        },
      });

      const wrapper = await prisma.artifactWrapper.create({
        data: {
          remediationId: createdRemediation.id,
          userId,
        },
      });

      const fixArtifact = await prisma.artifact.create({
        data: {
          wrapperId: wrapper.id,
          name: "Fix",
          artifactType: "Emulator" as ArtifactType,
          downloadUrl: remediation.fixUri,
          versionNumber: 1,
          userId,
        },
      });

      await prisma.artifactWrapper.update({
        where: { id: wrapper.id },
        data: {
          latestArtifactId: fixArtifact.id,
        },
      });

      return createdRemediation;
    }),
  );

  const successfulRemediations = remediations.filter((r) => r !== null);
  console.log(`✅ Seeded ${successfulRemediations.length} remediations`);
  return successfulRemediations;
}

async function seedIssues() {
  console.log("\n🌱 Seeding issues (linking assets to vulnerabilities)...");

  const assets = await prisma.asset.findMany({
    include: { deviceGroup: true },
  });

  const vulnerabilities = await prisma.vulnerability.findMany({
    include: { deviceGroupMatchings: true },
  });

  const issues = [];

  for (const asset of assets) {
    for (const vulnerability of vulnerabilities) {
      const isAffected = vulnerability.deviceGroupMatchings.some((m) =>
        matchingMatchesGroup(m, asset.deviceGroup),
      );

      if (isAffected) {
        try {
          const issue = await prisma.issue.create({
            data: {
              assetId: asset.id,
              vulnerabilityId: vulnerability.id,
              status: "ACTIVE",
            },
          });
          issues.push(issue);
        } catch (_error) {
          console.warn(
            `⚠️  Issue already exists for asset ${asset.id} and vulnerability ${vulnerability.id}`,
          );
        }
      }
    }
  }

  console.log(`✅ Seeded ${issues.length} issues`);
  return issues;
}

async function seedMemories(userId: string) {
  console.log("\n🌱 Seeding memories...");

  const memories = await Promise.all(
    SAMPLE_MEMORIES.map((memory) =>
      prisma.memory.create({
        data: {
          content: memory.content,
          userId,
        },
      }),
    ),
  );

  console.log(`✅ Seeded ${memories.length} memories`);
  return memories;
}

async function seedWorkflows(userId: string) {
  console.log("\n🌱 Seeding workflows...");

  const STEP_POS = 100;

  // ── Workflow 1: Emergency CT — Acute Stroke / Trauma Protocol ───────────────
  const workflow1 = await prisma.workflow.create({
    data: {
      name: "Emergency CT: Acute Stroke / Trauma Protocol",
      description:
        "End-to-end clinical pathway for a time-sensitive ED imaging order — from patient arrival through CT acquisition, PACS routing, radiology interpretation, and ED treatment decision.",
      userId,
    },
  });

  const w1nodes = await Promise.all([
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "Patient Arrives at ED",
        type: "STEP",
        position: { x: 0 * STEP_POS, y: 0 },
        data: {
          label: "Patient Arrives at ED",
          description:
            "Patient presents with suspected stroke, trauma, or altered mental status — time-sensitive imaging required.",
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "ED Physician Orders CT",
        type: "STEP",
        position: { x: 1 * STEP_POS, y: 0 },
        data: {
          label: "ED Physician Orders CT",
          description:
            "Clinical order placed for emergent CT scan with contrast.",
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "CT Scanner",
        type: "ASSET",
        position: { x: 2 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "GE BrightSpeed Elite Select",
          description:
            "GE BrightSpeed Elite Select acquires axial and helical CT studies. Completed images are sent to the CT acquisition workstation via DICOM.",
          cpes: [
            "cpe:2.3:h:gehealthcare:brightspeed_elite_select:-:*:*:*:*:*:*:*",
          ],
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "CT Acquisition Workstation",
        type: "ASSET",
        position: { x: 3 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "CT Acquisition Workstation",
          description:
            "GE Advantage Workstation 4.6 processes raw CT data, reconstructs images, and pushes the completed study to PACS.",
          assetIds: ["rad-ws-001"],
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "PACS Server",
        type: "ASSET",
        position: { x: 4 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "PACS Server",
          description:
            "Centricity PACS-IW v5.0 stores and routes DICOM studies to radiology workstations and the ED image viewer.",
          assetIds: ["rad-pacs-001"],
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "Radiology Diagnostic Workstations",
        type: "ASSET",
        position: { x: 5 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "Radiology Diagnostic Workstations",
          description:
            "Radiologist interprets the CT study on a diagnostic-grade display, dictates findings, and signs the final report.",
          assetIds: ["rad-rws-001", "rad-rws-002"],
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "ED Image Viewer",
        type: "ASSET",
        position: { x: 6 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "ED Image Viewer",
          description:
            "ED team reviews the imaging study and the signed radiology report to guide treatment and disposition decisions.",
          assetIds: ["rad-ed-001"],
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "Treatment / Disposition Decision",
        type: "STEP",
        position: { x: 7 * STEP_POS, y: 0 },
        data: {
          label: "Treatment / Disposition Decision",
          description:
            "ED team uses imaging result for treatment, transfer, or patient disposition.",
        },
      },
    }),
  ]);

  for (let i = 0; i < w1nodes.length - 1; i++) {
    await prisma.connection.create({
      data: {
        workflowId: workflow1.id,
        fromNodeId: w1nodes[i].id,
        toNodeId: w1nodes[i + 1].id,
        fromOutput: "main",
        toInput: "main",
      },
    });
  }

  console.log(`  ✅ "${workflow1.name}" (${w1nodes.length} nodes)`);

  // ── Workflow 2: Remote Radiology — After-Hours Imaging Coverage ─────────────
  const workflow2 = await prisma.workflow.create({
    data: {
      name: "Remote Radiology — After-Hours Imaging Coverage",
      description:
        "Workflow for inpatient studies acquired after hours and routed to a remote radiologist via VPN, enabling continuous imaging coverage and timely clinical decisions around the clock.",
      userId,
    },
  });

  const w2nodes = await Promise.all([
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "Inpatient Imaging Order Placed",
        type: "STEP",
        position: { x: 0 * STEP_POS, y: 0 },
        data: {
          label: "Inpatient Imaging Order Placed",
          description:
            "Clinical team orders after-hours imaging for an inpatient.",
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "Imaging Device",
        type: "ASSET",
        position: { x: 1 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "Portable Ultrasound / X-Ray",
          description:
            "GE LOGIQ e R7 portable ultrasound or Optima XR200amx DR system acquires bedside or mobile studies for inpatients.",
          cpes: [
            "cpe:2.3:h:gehealthcare:logiq_e:r7:*:*:*:*:*:*:*",
            "cpe:2.3:h:gehealthcare:optima_xr200amx:-:*:*:*:*:*:*:*",
          ],
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "PACS Server",
        type: "ASSET",
        position: { x: 2 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "PACS Server",
          description:
            "Centricity PACS-IW v5.0 stores the study and routes it to the remote radiologist via the VPN gateway.",
          assetIds: ["rad-pacs-001"],
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "Remote Radiology VPN Gateway",
        type: "ASSET",
        position: { x: 3 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "Remote Radiology VPN Gateway",
          description:
            "Cisco ASA 5505 VPN gateway provides secure encrypted connectivity for remote radiologist access to the hospital PACS.",
          assetIds: ["rad-vpn-001"],
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "Remote Radiologist Reviews Study",
        type: "STEP",
        position: { x: 4 * STEP_POS, y: 0 },
        data: {
          label: "Remote Radiologist Reviews Study",
          description:
            "Off-site radiologist reads the study via VPN and prepares a signed report.",
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "Signed Report Returned to Care Team",
        type: "STEP",
        position: { x: 5 * STEP_POS, y: 0 },
        data: {
          label: "Signed Report Returned to Care Team",
          description:
            "Final radiology report transmitted back to the ordering care team.",
        },
      },
    }),
  ]);

  for (let i = 0; i < w2nodes.length - 1; i++) {
    await prisma.connection.create({
      data: {
        workflowId: workflow2.id,
        fromNodeId: w2nodes[i].id,
        toNodeId: w2nodes[i + 1].id,
        fromOutput: "main",
        toInput: "main",
      },
    });
  }

  console.log(`  ✅ "${workflow2.name}" (${w2nodes.length} nodes)`);
  console.log("✅ Workflow seeding complete");
}

async function seedCategoryColors() {
  console.log("\n🌱 Seeding category colors...");
  await Promise.all(
    SAMPLE_CATEGORY_COLORS.map((c) =>
      prisma.categoryColor.upsert({
        where: { category: c.category },
        update: { color: c.color },
        create: c,
      }),
    ),
  );
  console.log(`✅ Seeded ${SAMPLE_CATEGORY_COLORS.length} category colors`);
}

async function seedDepartments(userId: string) {
  console.log("\n🌱 Seeding departments...");

  const departments = await Promise.all(
    SAMPLE_DEPARTMENTS.map((dept) =>
      prisma.department.upsert({
        where: { name: dept.name },
        update: dept,
        create: dept,
      }),
    ),
  );

  const seedUserDept = departments.find((d) => d.name === SEED_USER_DEPARTMENT);
  if (seedUserDept) {
    await prisma.user.update({
      where: { id: userId },
      data: { departmentId: seedUserDept.id },
    });
  }

  console.log(`✅ Seeded ${departments.length} departments`);
  return departments;
}

// Fixed timestamps so the seeded unread-comments indicator is deterministic:
// commented tickets get `lastCommentAt = COMMENTED_AT`, and the seed user's
// `seenAt` lands before (unread) or after (read) that moment.
const COMMENTED_AT = new Date("2026-06-20T12:00:00Z");
const SEEN_BEFORE_COMMENT = new Date("2026-06-19T09:00:00Z");
const SEEN_AFTER_COMMENT = new Date("2026-06-21T09:00:00Z");

async function createWorkOrderTicket(
  ticket: SampleTicket,
  userId: string,
  parentId: string | null,
) {
  // Normalize single-dept and multi-dept shapes to one ordered list. The
  // first entry is the "primary" department, used as the fallback target
  // for the default `description` field.
  const departmentNames = Array.isArray(ticket.department)
    ? ticket.department
    : [ticket.department];
  const departments = await prisma.department.findMany({
    where: { name: { in: departmentNames } },
  });
  // Preserve the seed-declared order.
  const departmentsByName = new Map(departments.map((d) => [d.name, d]));
  const orderedDepartments = departmentNames
    .map((n) => departmentsByName.get(n))
    .filter((d): d is (typeof departments)[number] => Boolean(d));

  const linkedVulns = ticket.linkedCveIds?.length
    ? await prisma.vulnerability.findMany({
        where: { cveId: { in: ticket.linkedCveIds } },
        select: { id: true },
      })
    : [];

  const linkedAssets = ticket.linkedAssetIds?.length
    ? await prisma.asset.findMany({
        where: { id: { in: ticket.linkedAssetIds } },
        select: { id: true },
      })
    : [];

  const linkedRemediations = ticket.linkedCveIds?.length
    ? await prisma.remediation.findMany({
        where: { vulnerability: { cveId: { in: ticket.linkedCveIds } } },
        select: { id: true },
      })
    : [];

  const linkedIssues =
    ticket.linkedAssetIds?.length && ticket.linkedCveIds?.length
      ? await prisma.issue.findMany({
          where: {
            assetId: { in: ticket.linkedAssetIds },
            vulnerability: { cveId: { in: ticket.linkedCveIds } },
          },
          select: { id: true },
        })
      : [];

  // Build one description row per linked department. Each department gets
  // its per-department override from `descriptionsByDepartment` if present;
  // the primary department additionally falls back to the default
  // `description` field. Departments without any body produce no row.
  const seededDescriptions = orderedDepartments
    .map((d, idx) => {
      const override = ticket.descriptionsByDepartment?.[d.name];
      const body = override ?? (idx === 0 ? ticket.description : undefined);
      if (!body) return null;
      return { body, departmentId: d.id };
    })
    .filter((d): d is { body: string; departmentId: string } => d !== null);

  return prisma.workOrderTicket.create({
    data: {
      summary: ticket.summary,
      status: ticket.status,
      category: ticket.category,
      source: ticket.source,
      sourceLabel: ticket.sourceLabel,
      departments: {
        connect: orderedDepartments.map((d) => ({ id: d.id })),
      },
      descriptions: seededDescriptions.length
        ? { create: seededDescriptions }
        : undefined,
      parentId,
      creatorId: userId,
      assigneeId: userId,
      // Creator + assignee auto-watch (both are `userId` here, so one row).
      watchers: { create: [{ userId }] },
      // Stamp lastCommentAt for commented tickets, and the user's last-seen
      // before/after it to drive a realistic read/unread mix.
      lastCommentAt: ticket.comments?.length ? COMMENTED_AT : null,
      seenBy: {
        create: [
          {
            userId,
            seenAt:
              ticket.comments?.length && ticket.commentsUnread
                ? SEEN_BEFORE_COMMENT
                : SEEN_AFTER_COMMENT,
          },
        ],
      },
      scheduledAt: ticket.scheduledAt,
      vulnerabilities: { connect: linkedVulns.map((v) => ({ id: v.id })) },
      assets: { connect: linkedAssets.map((a) => ({ id: a.id })) },
      remediations: {
        connect: linkedRemediations.map((r) => ({ id: r.id })),
      },
      issues: { connect: linkedIssues.map((i) => ({ id: i.id })) },
      comments: ticket.comments?.length
        ? {
            create: ticket.comments.map((body) => ({
              body,
              authorId: userId,
            })),
          }
        : undefined,
    },
  });
}

async function seedWorkOrderTickets(userId: string) {
  console.log("\n🌱 Seeding work order tickets...");

  let parentCount = 0;
  let childCount = 0;

  for (const parent of SAMPLE_CHANGE_TICKETS) {
    const created = await createWorkOrderTicket(parent, userId, null);
    parentCount++;
    for (const child of parent.children ?? []) {
      await createWorkOrderTicket(child, userId, created.id);
      childCount++;
    }
  }

  console.log(
    `✅ Seeded ${parentCount} parent tickets and ${childCount} child tickets`,
  );
}

async function main() {
  console.log("🌱 Starting database seed...\n");

  try {
    const shouldClear = process.env.SEED_CLEAR_DB === "true";
    if (shouldClear) {
      await clearDatabase();
    }

    const user = await createOrGetSeedUser();

    await seedDepartments(user.id);
    await seedCategoryColors();
    await seedDeviceGroups();
    await seedAssets(user.id);
    await seedVulnerabilities(user.id);
    await seedDeviceArtifacts(user.id);
    await seedRemediations(user.id);
    await seedIssues();
    await seedWorkflows(user.id);
    await seedMemories(user.id);
    await seedWorkOrderTickets(user.id);

    console.log("\n✅ Database seeding completed successfully!");
    console.log(`\n📧 Login with: ${SEED_USER.email} / ${SEED_USER.password}`);
  } catch (error) {
    console.error("\n❌ Error during database seeding:", error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
