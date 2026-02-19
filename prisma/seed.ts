import { hashPassword } from "better-auth/crypto";
import {
  type ArtifactType,
  type AssetStatus,
  Priority,
  Severity,
} from "@/generated/prisma";
import prisma from "@/lib/db";

// Seed user credentials
const SEED_USER = {
  email: "user@example.com",
  password: "1337_gone_jolene",
  name: "Seed User",
};

// Sample device groups (manufacturers and models)
const SAMPLE_DEVICE_GROUPS = [
  // ICU Medical Devices
  {
    cpe: "cpe:2.3:h:philips:intellivue_mp70:*:*:*:*:*:*:*:*",
    manufacturer: "Philips",
    modelName: "IntelliVue MP70",
    version: "Rev B",
  },
  {
    cpe: "cpe:2.3:h:baxter:infusion_pump:sigma_spectrum:*:*:*:*:*:*:*",
    manufacturer: "Baxter",
    modelName: "Sigma Spectrum Infusion Pump",
    version: "8.0",
  },
  {
    cpe: "cpe:2.3:h:ge_healthcare:dash_4000:*:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "DASH 4000",
    version: "3.0",
  },
  {
    cpe: "cpe:2.3:h:draeger:evita_v500:*:*:*:*:*:*:*:*",
    manufacturer: "Dräger",
    modelName: "Evita V500",
    version: "2.5",
  },
  // Laboratory Equipment
  {
    cpe: "cpe:2.3:h:roche:cobas_6000:*:*:*:*:*:*:*:*",
    manufacturer: "Roche",
    modelName: "Cobas 6000",
    version: "c501",
  },
  {
    cpe: "cpe:2.3:h:abbott:architect_i2000sr:*:*:*:*:*:*:*:*",
    manufacturer: "Abbott",
    modelName: "Architect i2000SR",
    version: "5.0",
  },
  {
    cpe: "cpe:2.3:h:sysmex:xs-1000i:*:*:*:*:*:*:*:*",
    manufacturer: "Sysmex",
    modelName: "XS-1000i",
    version: "1.2",
  },
  // Imaging Equipment
  {
    cpe: "cpe:2.3:h:siemens:magnetom_aera:*:*:*:*:*:*:*:*",
    manufacturer: "Siemens Healthineers",
    modelName: "Magnetom Aera",
    version: "VE11C",
  },
  {
    cpe: "cpe:2.3:h:ge_healthcare:optima_ct660:*:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "Optima CT660",
    version: "15.0",
  },
  {
    cpe: "cpe:2.3:h:fujifilm:fcr_xg-1:*:*:*:*:*:*:*:*",
    manufacturer: "Fujifilm",
    modelName: "FCR XG-1",
    version: "2.0",
  },
  // IT Infrastructure
  {
    cpe: "cpe:2.3:a:epic:emr:2023:*:*:*:*:*:*:*",
    manufacturer: "Epic Systems",
    modelName: "EMR",
    version: "2023",
  },
  {
    cpe: "cpe:2.3:a:cerner:millennium:*:*:*:*:*:*:*:*",
    manufacturer: "Cerner",
    modelName: "Millennium",
    version: "2023.1",
  },
  {
    cpe: "cpe:2.3:a:meditech:expanse:*:*:*:*:*:*:*:*",
    manufacturer: "Meditech",
    modelName: "Expanse",
    version: "7.0",
  },
  {
    cpe: "cpe:2.3:h:cisco:unified_communications:*:*:*:*:*:*:*:*",
    manufacturer: "Cisco",
    modelName: "Unified Communications",
    version: "12.5",
  },
  // Surgical Equipment
  {
    cpe: "cpe:2.3:h:stryker:surgical_navigation:*:*:*:*:*:*:*:*",
    manufacturer: "Stryker",
    modelName: "Surgical Navigation System",
    version: "8.0",
  },
  {
    cpe: "cpe:2.3:h:intuitive:da_vinci_xi:*:*:*:*:*:*:*:*",
    manufacturer: "Intuitive Surgical",
    modelName: "da Vinci Xi",
    version: "5.0",
  },
  // Workstations
  {
    cpe: "cpe:2.3:h:dell:optiplex_7090:*:*:*:*:*:*:*:*",
    manufacturer: "Dell",
    modelName: "OptiPlex 7090",
    version: "N/A",
  },
  {
    cpe: "cpe:2.3:h:hp:elitedesk_800:*:*:*:*:*:*:*:*",
    manufacturer: "HP",
    modelName: "EliteDesk 800",
    version: "G8",
  },
  {
    cpe: "cpe:2.3:h:lenovo:thinkcentre_m90a:*:*:*:*:*:*:*:*",
    manufacturer: "Lenovo",
    modelName: "ThinkCentre M90a",
    version: "Gen 3",
  },
  // Network Infrastructure
  {
    cpe: "cpe:2.3:h:cisco:catalyst_9300:*:*:*:*:*:*:*:*",
    manufacturer: "Cisco",
    modelName: "Catalyst 9300",
    version: "IOS-XE 17.6",
  },
  {
    cpe: "cpe:2.3:h:fortinet:fortigate_600e:*:*:*:*:*:*:*:*",
    manufacturer: "Fortinet",
    modelName: "FortiGate 600E",
    version: "7.0",
  },
];

// Sample hospital asset data (individual devices)
const SAMPLE_ASSETS = [
  // ICU Medical Devices
  {
    ip: "10.20.1.101",
    cpe: "cpe:2.3:h:philips:intellivue_mp70:*:*:*:*:*:*:*:*",
    role: "ICU Patient Monitor",
    upstreamApi: "https://api.philips.com/devices/monitor",
    networkSegment: "ICU-VLAN-20",
    hostname: "ICU-MON-101",
    macAddress: "00:1A:2B:3C:4D:5E",
    serialNumber: "PH-MP70-2023-001",
    location: {
      facility: "Main Hospital",
      building: "Tower A",
      floor: "3",
      room: "ICU-301",
    },
    status: "Active",
  },
  {
    ip: "10.20.1.102",
    cpe: "cpe:2.3:h:baxter:infusion_pump:sigma_spectrum:*:*:*:*:*:*:*",
    role: "Infusion Pump",
    upstreamApi: "https://api.baxter.com/devices/pump",
    networkSegment: "ICU-VLAN-20",
    hostname: "ICU-PUMP-102",
    macAddress: "00:1A:2B:3C:4D:5F",
    serialNumber: "BX-SS-2023-042",
    location: {
      facility: "Main Hospital",
      building: "Tower A",
      floor: "3",
      room: "ICU-302",
    },
    status: "Active",
  },
  {
    ip: "10.20.1.103",
    cpe: "cpe:2.3:h:ge_healthcare:dash_4000:*:*:*:*:*:*:*:*",
    role: "Vital Signs Monitor",
    upstreamApi: "https://api.gehealthcare.com/devices/vitals",
    networkSegment: "ICU-VLAN-20",
    hostname: "ICU-VITAL-103",
    macAddress: "00:1A:2B:3C:4D:60",
    serialNumber: "GE-D4K-2023-078",
    location: {
      facility: "Main Hospital",
      building: "Tower A",
      floor: "3",
      room: "ICU-303",
    },
    status: "Active",
  },
  {
    ip: "10.20.1.104",
    cpe: "cpe:2.3:h:draeger:evita_v500:*:*:*:*:*:*:*:*",
    role: "Ventilator",
    upstreamApi: "https://api.draeger.com/devices/ventilator",
    networkSegment: "ICU-VLAN-20",
    hostname: "ICU-VENT-104",
    macAddress: "00:1A:2B:3C:4D:61",
    serialNumber: "DR-EV5-2023-015",
    location: {
      facility: "Main Hospital",
      building: "Tower A",
      floor: "3",
      room: "ICU-304",
    },
    status: "Active",
  },
  // Laboratory Equipment
  {
    ip: "10.30.2.201",
    cpe: "cpe:2.3:h:roche:cobas_6000:*:*:*:*:*:*:*:*",
    role: "Laboratory Analyzer",
    upstreamApi: "https://api.roche.com/lab/analyzer",
    networkSegment: "LAB-VLAN-30",
    hostname: "LAB-COBAS-201",
    macAddress: "00:1A:2B:3C:4D:62",
    serialNumber: "RC-C6K-2023-009",
    location: {
      facility: "Main Hospital",
      building: "Tower B",
      floor: "1",
      room: "Lab-Core",
    },
    status: "Active",
  },
  {
    ip: "10.30.2.202",
    cpe: "cpe:2.3:h:abbott:architect_i2000sr:*:*:*:*:*:*:*:*",
    role: "Immunoassay Analyzer",
    upstreamApi: "https://api.abbott.com/lab/immunoassay",
    networkSegment: "LAB-VLAN-30",
    hostname: "LAB-ABBOTT-202",
    macAddress: "00:1A:2B:3C:4D:63",
    serialNumber: "AB-I2K-2023-024",
    location: {
      facility: "Main Hospital",
      building: "Tower B",
      floor: "1",
      room: "Lab-Immuno",
    },
    status: "Active",
  },
  {
    ip: "10.30.2.203",
    cpe: "cpe:2.3:h:sysmex:xs-1000i:*:*:*:*:*:*:*:*",
    role: "Hematology Analyzer",
    upstreamApi: "https://api.sysmex.com/lab/hematology",
    networkSegment: "LAB-VLAN-30",
    hostname: "LAB-SYSMEX-203",
    macAddress: "00:1A:2B:3C:4D:64",
    serialNumber: "SY-XS1-2023-051",
    location: {
      facility: "Main Hospital",
      building: "Tower B",
      floor: "1",
      room: "Lab-Heme",
    },
    status: "Active",
  },
  // Imaging Equipment
  {
    ip: "10.40.3.301",
    cpe: "cpe:2.3:h:siemens:magnetom_aera:*:*:*:*:*:*:*:*",
    role: "MRI Scanner",
    upstreamApi: "https://api.siemens-healthineers.com/imaging/mri",
    networkSegment: "IMAGING-VLAN-40",
    hostname: "RAD-MRI-301",
    macAddress: "00:1A:2B:3C:4D:65",
    serialNumber: "SI-MAG-2023-003",
    location: {
      facility: "Main Hospital",
      building: "Tower C",
      floor: "1",
      room: "MRI-Suite-1",
    },
    status: "Active",
  },
  {
    ip: "10.40.3.302",
    cpe: "cpe:2.3:h:ge_healthcare:optima_ct660:*:*:*:*:*:*:*:*",
    role: "CT Scanner",
    upstreamApi: "https://api.gehealthcare.com/imaging/ct",
    networkSegment: "IMAGING-VLAN-40",
    hostname: "RAD-CT-302",
    macAddress: "00:1A:2B:3C:4D:66",
    serialNumber: "GE-CT6-2023-012",
    location: {
      facility: "Main Hospital",
      building: "Tower C",
      floor: "1",
      room: "CT-Suite-2",
    },
    status: "Active",
  },
  {
    ip: "10.40.3.303",
    cpe: "cpe:2.3:h:fujifilm:fcr_xg-1:*:*:*:*:*:*:*:*",
    role: "X-Ray System",
    upstreamApi: "https://api.fujifilm.com/imaging/xray",
    networkSegment: "IMAGING-VLAN-40",
    hostname: "RAD-XRAY-303",
    macAddress: "00:1A:2B:3C:4D:67",
    serialNumber: "FJ-XG1-2023-087",
    location: {
      facility: "Main Hospital",
      building: "Tower C",
      floor: "1",
      room: "XRay-Room-3",
    },
    status: "Active",
  },
  // IT Infrastructure
  {
    ip: "10.10.4.401",
    cpe: "cpe:2.3:a:epic:emr:2023:*:*:*:*:*:*:*",
    role: "EMR Server",
    upstreamApi: "https://api.epic.com/emr/server",
    networkSegment: "IT-SERVER-VLAN-10",
    hostname: "EMR-PROD-401",
    macAddress: "00:1A:2B:3C:4D:68",
    serialNumber: "EP-EMR-2023-001",
    location: {
      facility: "Main Hospital",
      building: "Data Center",
      floor: "B1",
      room: "DC-Rack-12",
    },
    status: "Active",
  },
  {
    ip: "10.10.4.402",
    cpe: "cpe:2.3:a:cerner:millennium:*:*:*:*:*:*:*:*",
    role: "Clinical Information System",
    upstreamApi: "https://api.cerner.com/cis/server",
    networkSegment: "IT-SERVER-VLAN-10",
    hostname: "CIS-PROD-402",
    macAddress: "00:1A:2B:3C:4D:69",
    serialNumber: "CR-MIL-2023-005",
    location: {
      facility: "Main Hospital",
      building: "Data Center",
      floor: "B1",
      room: "DC-Rack-13",
    },
    status: "Active",
  },
  {
    ip: "10.10.4.403",
    cpe: "cpe:2.3:a:meditech:expanse:*:*:*:*:*:*:*:*",
    role: "Pharmacy System",
    upstreamApi: "https://api.meditech.com/pharmacy/server",
    networkSegment: "IT-SERVER-VLAN-10",
    hostname: "PHARM-PROD-403",
    macAddress: "00:1A:2B:3C:4D:6A",
    serialNumber: "MT-EXP-2023-008",
    location: {
      facility: "Main Hospital",
      building: "Data Center",
      floor: "B1",
      room: "DC-Rack-14",
    },
    status: "Active",
  },
  {
    ip: "10.10.4.404",
    cpe: "cpe:2.3:h:cisco:unified_communications:*:*:*:*:*:*:*:*",
    role: "Nurse Call System",
    upstreamApi: "https://api.cisco.com/communications/nurse",
    networkSegment: "IT-SERVER-VLAN-10",
    hostname: "NURSE-CALL-404",
    macAddress: "00:1A:2B:3C:4D:6B",
    serialNumber: "CS-UC-2023-019",
    location: {
      facility: "Main Hospital",
      building: "Data Center",
      floor: "B1",
      room: "DC-Rack-15",
    },
    status: "Active",
  },
  // Surgical Equipment
  {
    ip: "10.50.5.501",
    cpe: "cpe:2.3:h:stryker:surgical_navigation:*:*:*:*:*:*:*:*",
    role: "Surgical Navigation System",
    upstreamApi: "https://api.stryker.com/surgical/navigation",
    networkSegment: "OR-VLAN-50",
    hostname: "OR-NAV-501",
    macAddress: "00:1A:2B:3C:4D:6C",
    serialNumber: "ST-NAV-2023-007",
    location: {
      facility: "Main Hospital",
      building: "Tower A",
      floor: "4",
      room: "OR-5",
    },
    status: "Active",
  },
  {
    ip: "10.50.5.502",
    cpe: "cpe:2.3:h:intuitive:da_vinci_xi:*:*:*:*:*:*:*:*",
    role: "Robotic Surgical System",
    upstreamApi: "https://api.intuitive.com/surgical/robot",
    networkSegment: "OR-VLAN-50",
    hostname: "OR-ROBOT-502",
    macAddress: "00:1A:2B:3C:4D:6D",
    serialNumber: "IN-DV-2023-002",
    location: {
      facility: "Main Hospital",
      building: "Tower A",
      floor: "4",
      room: "OR-6",
    },
    status: "Active",
  },
  // Workstations
  {
    ip: "10.60.6.601",
    cpe: "cpe:2.3:h:dell:optiplex_7090:*:*:*:*:*:*:*:*",
    role: "Clinical Workstation",
    upstreamApi: "https://api.dell.com/workstation/clinical",
    networkSegment: "WORKSTATION-VLAN-60",
    hostname: "WKS-CLINIC-601",
    macAddress: "00:1A:2B:3C:4D:6E",
    serialNumber: "DL-OP7-2023-156",
    location: {
      facility: "Main Hospital",
      building: "Tower A",
      floor: "2",
      room: "Nurse-Station-2A",
    },
    status: "Active",
  },
  {
    ip: "10.60.6.602",
    cpe: "cpe:2.3:h:hp:elitedesk_800:*:*:*:*:*:*:*:*",
    role: "Nurse Station Workstation",
    upstreamApi: "https://api.hp.com/workstation/nurse",
    networkSegment: "WORKSTATION-VLAN-60",
    hostname: "WKS-NURSE-602",
    macAddress: "00:1A:2B:3C:4D:6F",
    serialNumber: "HP-ED8-2023-234",
    location: {
      facility: "Main Hospital",
      building: "Tower A",
      floor: "3",
      room: "Nurse-Station-3A",
    },
    status: "Active",
  },
  {
    ip: "10.60.6.603",
    cpe: "cpe:2.3:h:lenovo:thinkcentre_m90a:*:*:*:*:*:*:*:*",
    role: "Administrative Workstation",
    upstreamApi: "https://api.lenovo.com/workstation/admin",
    networkSegment: "ADMIN-VLAN-65",
    hostname: "WKS-ADMIN-603",
    macAddress: "00:1A:2B:3C:4D:70",
    serialNumber: "LN-M90-2023-089",
    location: {
      facility: "Main Hospital",
      building: "Tower B",
      floor: "2",
      room: "Admin-Office-201",
    },
    status: "Active",
  },
  // Network Infrastructure
  {
    ip: "10.70.7.701",
    cpe: "cpe:2.3:h:cisco:catalyst_9300:*:*:*:*:*:*:*:*",
    role: "Network Switch",
    upstreamApi: "https://api.cisco.com/network/switch",
    networkSegment: "INFRASTRUCTURE-VLAN-70",
    hostname: "SW-CORE-701",
    macAddress: "00:1A:2B:3C:4D:71",
    serialNumber: "CS-C93-2023-045",
    location: {
      facility: "Main Hospital",
      building: "Data Center",
      floor: "B1",
      room: "DC-Network",
    },
    status: "Active",
  },
  {
    ip: "10.70.7.702",
    cpe: "cpe:2.3:h:fortinet:fortigate_600e:*:*:*:*:*:*:*:*",
    role: "Firewall",
    upstreamApi: "https://api.fortinet.com/network/firewall",
    networkSegment: "INFRASTRUCTURE-VLAN-70",
    hostname: "FW-EDGE-702",
    macAddress: "00:1A:2B:3C:4D:72",
    serialNumber: "FT-FG6-2023-011",
    location: {
      facility: "Main Hospital",
      building: "Data Center",
      floor: "B1",
      room: "DC-Security",
    },
    status: "Active",
  },
];

// Sample hospital vulnerability data

const SAMPLE_VULNERABILITIES = [
  // --- Critical priority: confirmed exploitation, high CVSS, high EPSS, in KEV ---
  {
    cveId: "CVE-2024-21762",
    severity: Severity.Critical,
    cvssScore: 9.8,
    epss: 0.91,
    inKEV: true,
    priority: Priority.Critical,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "Network Scanner" } },
          results: [
            {
              ruleId: "CVE-2024-21762",
              level: "error",
              message: {
                text: "Out-of-bounds write in Fortinet FortiOS SSL VPN allows unauthenticated remote code execution",
              },
            },
          ],
        },
      ],
    },
    cpe: "cpe:2.3:h:fortinet:fortigate_600e:*:*:*:*:*:*:*:*",
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2024-21762",
    upstreamApi: "https://www.fortiguard.com/psirt/FG-IR-24-015",
    description:
      "Out-of-bounds write vulnerability in Fortinet FortiOS SSL VPN daemon allows unauthenticated remote code execution via specially crafted HTTP requests",
    narrative:
      "An unauthenticated attacker can send crafted HTTP requests to the SSL VPN service on the hospital perimeter firewall, triggering an out-of-bounds write that leads to arbitrary code execution. This vulnerability is actively exploited in the wild by multiple threat actors and requires no user interaction.",
    impact:
      "Complete hospital network perimeter compromise. Attackers gain root-level access to the edge firewall, enabling interception of all network traffic, disabling of security policies, and lateral movement into clinical VLANs containing medical devices, EMR systems, and patient data stores.",
  },
  {
    cveId: "CVE-2023-20198",
    severity: Severity.Critical,
    cvssScore: 10.0,
    epss: 0.87,
    inKEV: true,
    priority: Priority.Critical,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "Network Scanner" } },
          results: [
            {
              ruleId: "CVE-2023-20198",
              level: "error",
              message: {
                text: "Cisco IOS XE Web UI privilege escalation allows unauthenticated admin account creation",
              },
            },
          ],
        },
      ],
    },
    cpe: "cpe:2.3:h:cisco:catalyst_9300:*:*:*:*:*:*:*:*",
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2023-20198",
    upstreamApi:
      "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-iosxe-webui-privesc-j22SaA4z",
    description:
      "Privilege escalation vulnerability in Cisco IOS XE Web UI allows unauthenticated remote attackers to create administrative accounts",
    narrative:
      "An unauthenticated remote attacker can exploit the web UI feature of Cisco IOS XE to create a local administrator account with privilege level 15. This is the first stage of a two-stage attack chain (combined with CVE-2023-20273) that ultimately grants root access to the network switch operating system. Over 1,800 devices were compromised in mass exploitation campaigns.",
    impact:
      "Hospital network segmentation failure. Compromised core switches allow attackers to reconfigure VLANs, bypass network access controls, and gain access to isolated medical device networks. Lateral movement enables interception of patient data, disruption of PACS/EMR traffic, and potential manipulation of clinical systems.",
  },
  {
    cveId: "CVE-2024-1709",
    severity: Severity.Critical,
    cvssScore: 10.0,
    epss: 0.944,
    inKEV: true,
    priority: Priority.Critical,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "Endpoint Scanner" } },
          results: [
            {
              ruleId: "CVE-2024-1709",
              level: "error",
              message: {
                text: "ConnectWise ScreenConnect authentication bypass on clinical workstations",
              },
            },
          ],
        },
      ],
    },
    cpe: "cpe:2.3:h:dell:optiplex_7090:*:*:*:*:*:*:*:*",
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2024-1709",
    upstreamApi:
      "https://www.connectwise.com/company/trust/security-bulletins/connectwise-screenconnect-23.9.8",
    description:
      "Authentication bypass in ConnectWise ScreenConnect allows unauthenticated attackers to create administrator accounts on clinical workstations used for remote EMR support",
    narrative:
      "ConnectWise ScreenConnect, deployed on clinical workstations for remote IT support of EMR systems, contains an authentication bypass vulnerability. Unauthenticated attackers can create admin-level accounts, gaining full control of any connected workstation. Public exploits and Metasploit modules are available. Used in ransomware campaigns targeting healthcare.",
    impact:
      "Clinical workstation compromise across the hospital. Attackers gain remote desktop access to nurse stations and clinical PCs with active EMR sessions, exposing patient records, enabling ransomware deployment, and potentially disrupting clinical workflows during patient care.",
  },
  {
    cveId: "CVE-2024-47575",
    severity: Severity.Critical,
    cvssScore: 9.8,
    epss: 0.5,
    inKEV: true,
    priority: Priority.Critical,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "Network Scanner" } },
          results: [
            {
              ruleId: "CVE-2024-47575",
              level: "error",
              message: {
                text: "Missing authentication in FortiManager allows remote code execution via crafted requests",
              },
            },
          ],
        },
      ],
    },
    cpe: "cpe:2.3:h:fortinet:fortigate_600e:*:*:*:*:*:*:*:*",
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2024-47575",
    upstreamApi: "https://www.fortiguard.com/psirt/FG-IR-24-423",
    description:
      "Missing authentication vulnerability in FortiManager (FortiJump) allows unauthenticated remote code execution and exfiltration of managed firewall configurations",
    narrative:
      "The hospital's FortiManager instance, which centrally manages all FortiGate firewalls, has a missing authentication flaw. Threat actor UNC5820 exploited this vulnerability to register rogue FortiManager devices and exfiltrate configuration data including hashed passwords and firewall rules from over 50 managed devices in similar environments.",
    impact:
      "Compromise of the firewall management platform exposes all managed FortiGate configurations, security policies, VPN credentials, and network topology. Attackers can modify firewall rules to open backdoor access or disable security controls across the entire hospital network perimeter.",
  },
  {
    cveId: "CVE-2024-38014",
    severity: Severity.High,
    cvssScore: 7.8,
    epss: 0.15,
    inKEV: true,
    priority: Priority.Critical,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "Endpoint Scanner" } },
          results: [
            {
              ruleId: "CVE-2024-38014",
              level: "warning",
              message: {
                text: "Windows Installer privilege escalation on nurse station workstations",
              },
            },
          ],
        },
      ],
    },
    cpe: "cpe:2.3:h:hp:elitedesk_800:*:*:*:*:*:*:*:*",
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2024-38014",
    upstreamApi:
      "https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-38014",
    description:
      "Windows Installer privilege escalation vulnerability allows local attackers to gain SYSTEM privileges on nurse station workstations",
    narrative:
      "A local attacker (or malware running under a standard user account) can exploit the Windows Installer service to escalate privileges to SYSTEM level. While requiring local access, this vulnerability is actively exploited and could be chained with remote access vulnerabilities to achieve full workstation compromise.",
    impact:
      "Local privilege escalation on nurse station PCs. An attacker with limited user access can gain full system control, install persistent backdoors, access cached credentials, and pivot to other systems on the clinical network. Risk is moderated by requiring initial local access.",
  },
  // --- Defer priority: low EPSS, no active exploitation ---
  {
    cveId: "CVE-2024-48974",
    severity: Severity.Critical,
    cvssScore: 9.3,
    epss: 0.04,
    inKEV: false,
    priority: Priority.Defer,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "FDA Cybersecurity Scanner" } },
          results: [
            {
              ruleId: "CVE-2024-48974",
              level: "warning",
              message: {
                text: "Ventilator firmware update integrity verification bypass",
              },
            },
          ],
        },
      ],
    },
    cpe: "cpe:2.3:h:draeger:evita_v500:*:*:*:*:*:*:*:*",
    exploitUri: "https://nvd.nist.gov/vuln/detail/CVE-2024-48974",
    upstreamApi:
      "https://www.cisa.gov/news-events/ics-medical-advisories/icsma-24-319-01",
    description:
      "Ventilator does not perform proper file integrity checks when adopting firmware updates, allowing unauthorized configuration changes via compromised firmware",
    narrative:
      "The ventilator's firmware update mechanism lacks proper integrity verification, meaning a malicious firmware image could be loaded if an attacker gains physical or network access to the update interface. While the CVSS score is critical due to potential patient safety impact, no exploitation has been observed in the wild and the attack requires specialized access to the device.",
    impact:
      "Potential patient safety risk if exploited — unauthorized firmware could alter ventilator behavior. However, exploitation requires physical access or highly specialized network position. Risk is mitigated by network segmentation of ICU devices and physical access controls.",
  },
  // --- Unsorted priority: not yet enriched ---
  {
    cveId: null,
    severity: Severity.Medium,
    cvssScore: null,
    epss: null,
    inKEV: false,
    priority: Priority.Unsorted,
    sarif: {
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "Internal Audit" } },
          results: [
            {
              ruleId: "INTERNAL-2024-001",
              level: "note",
              message: {
                text: "Unencrypted DICOM traffic observed from MRI scanner",
              },
            },
          ],
        },
      ],
    },
    cpe: "cpe:2.3:h:siemens:magnetom_aera:*:*:*:*:*:*:*:*",
    exploitUri: null,
    upstreamApi: null,
    description:
      "Unencrypted DICOM traffic from Siemens MRI scanner exposes patient imaging data on the radiology network",
    narrative:
      "Internal security audit detected that the Siemens Magnetom Aera transmits DICOM images and patient metadata in cleartext across the radiology VLAN. An attacker with network access could passively capture patient imaging studies, demographics, and referring physician information.",
    impact:
      "HIPAA compliance risk. Patient imaging data including names, dates of birth, and medical images could be intercepted. No CVE has been assigned yet; awaiting vendor response and formal vulnerability assessment.",
  },
];

// Sample device artifact data (formerly emulators)
const SAMPLE_DEVICE_ARTIFACTS = [
  {
    role: "Philips IntelliVue MP70 Monitor Emulator",
    cpe: "cpe:2.3:h:philips:intellivue_mp70:*:*:*:*:*:*:*:*",
    dockerUrl: "https://hub.docker.com/r/icsemu/philips-mp70-emulator:v1.2",
    description:
      "Docker-based emulator for Philips IntelliVue MP70 patient monitor. Simulates vital sign data streams, alarm conditions, and network protocols (HL7, proprietary Philips protocol). Useful for security testing, integration testing, and staff training without requiring physical hardware.",
  },
  {
    role: "Baxter Sigma Spectrum Infusion Pump Emulator",
    cpe: "cpe:2.3:h:baxter:infusion_pump:sigma_spectrum:*:*:*:*:*:*:*",
    downloadUrl:
      "https://github.com/medical-device-emulators/baxter-pump-vm/releases/download/v2.1/baxter-sigma-spectrum-vm.ova",
    description:
      "VirtualBox/VMware OVA containing a software emulation of the Baxter Sigma Spectrum infusion pump. Includes drug library interface, dosing calculations, and alarm mechanisms. Supports security research and clinical workflow testing in safe sandbox environment.",
  },
  {
    role: "GE DASH 4000 Vital Signs Monitor Emulator",
    cpe: "cpe:2.3:h:ge_healthcare:dash_4000:*:*:*:*:*:*:*:*",
    dockerUrl: "https://hub.docker.com/r/healthemu/ge-dash-4000:latest",
    description:
      "Containerized emulator of GE DASH 4000 patient monitor. Generates realistic ECG waveforms, SpO2 trends, and NIBP readings. Exposes network services for remote monitoring and alarm integration. Ideal for vulnerability assessment and penetration testing of patient monitoring networks.",
  },
  {
    role: "Dräger Evita V500 Ventilator Simulator",
    cpe: "cpe:2.3:h:draeger:evita_v500:*:*:*:*:*:*:*:*",
    downloadUrl:
      "https://github.com/critical-care-sims/draeger-ventilator/releases/download/v1.0/draeger-evita-v500.qcow2",
    description:
      "QEMU disk image running Dräger Evita V500 ventilator firmware emulation. Simulates respiratory mechanics, pressure/volume ventilation modes, and alarm systems. Used for clinical engineering training and security analysis of critical respiratory support systems.",
  },
  {
    role: "Roche Cobas 6000 Laboratory Analyzer Emulator",
    cpe: "cpe:2.3:h:roche:cobas_6000:*:*:*:*:*:*:*:*",
    dockerUrl: "https://hub.docker.com/r/labemu/roche-cobas-6000:v3.0",
    description:
      "Docker container emulating Roche Cobas 6000 chemistry and immunoassay analyzer. Simulates LIS (Laboratory Information System) interface, result transmission protocols, and QC workflows. Enables security testing of lab analyzers without disrupting actual patient testing.",
  },
  {
    role: "Siemens Magnetom Aera MRI Scanner Emulator",
    cpe: "cpe:2.3:h:siemens:magnetom_aera:*:*:*:*:*:*:*:*",
    downloadUrl:
      "https://github.com/radiology-emulators/siemens-mri/releases/download/v2.3/magnetom-aera-sim.vmdk",
    description:
      "VMware disk image containing Siemens Syngo MR software emulator. Simulates DICOM services, imaging protocols, and scanner control interfaces. Supports penetration testing of radiology PACS networks and MRI security assessments without access to multi-million dollar scanners.",
  },
  {
    role: "Epic EMR Test Environment",
    cpe: "cpe:2.3:a:epic:emr:2023:*:*:*:*:*:*:*",
    downloadUrl:
      "https://github.com/ehr-test-envs/epic-sandbox/releases/download/2023.1/epic-emr-sandbox.ova",
    description:
      "Complete Epic EMR sandbox environment in OVA format. Includes patient records, HL7 interfaces, and FHIR APIs. Used for integration testing, security assessments, and clinical workflow validation. Pre-populated with synthetic patient data (HIPAA-compliant test data).",
  },
  {
    role: "GE Optima CT660 Scanner Emulator",
    cpe: "cpe:2.3:h:ge_healthcare:optima_ct660:*:*:*:*:*:*:*:*",
    dockerUrl: "https://hub.docker.com/r/imagingemu/ge-ct-scanner:v1.5",
    description:
      "Containerized CT scanner emulator with DICOM worklist (MWL) support, image acquisition simulation, and PACS connectivity. Generates synthetic CT image series for testing. Useful for assessing DICOM security vulnerabilities and radiation dose reporting integrations.",
  },
  {
    role: "Cisco Catalyst 9300 Network Switch Emulator",
    cpe: "cpe:2.3:h:cisco:catalyst_9300:*:*:*:*:*:*:*:*",
    dockerUrl:
      "https://hub.docker.com/r/networkemu/cisco-catalyst-9300:ios-xe-17",
    description:
      "GNS3/EVE-NG compatible Cisco IOS-XE emulator for Catalyst 9300 switches. Simulates VLAN configuration, port security, and hospital network segmentation. Allows penetration testers to practice network attacks against medical device networks in isolated lab environment.",
  },
  {
    role: "Abbott Architect i2000SR Immunoassay Analyzer Emulator",
    cpe: "cpe:2.3:h:abbott:architect_i2000sr:*:*:*:*:*:*:*:*",
    downloadUrl:
      "https://github.com/lab-device-emus/abbott-architect/releases/download/v1.1/abbott-i2000sr.ova",
    description:
      "VirtualBox VM running Abbott Architect immunoassay analyzer software stack. Simulates sample processing, result calculations, and LIS bi-directional interface. Enables security researchers to test lab analyzer vulnerabilities without impacting patient testing workflows.",
  },
];

// Sample remediation data (matched to seed vulnerability CPEs)
const SAMPLE_REMEDIATIONS = [
  {
    cpe: "cpe:2.3:h:fortinet:fortigate_600e:*:*:*:*:*:*:*:*",
    fixUri: "https://www.fortiguard.com/psirt/FG-IR-24-015",
    description:
      "FortiOS firmware upgrade to 7.4.3+ patches the out-of-bounds write vulnerability (CVE-2024-21762) in the SSL VPN daemon.",
    narrative:
      "Schedule maintenance window during low-traffic period (Sunday 2-6 AM). Backup FortiGate configuration via FortiManager. Upgrade firmware to FortiOS 7.4.3 or later. If immediate upgrade is not possible, disable SSL VPN as an interim mitigation — disabling webmode alone is not sufficient. Post-upgrade: verify VPN connectivity, firewall rules, and VLAN routing. Monitor logs for 48 hours.",
    upstreamApi: "https://www.fortinet.com/products/next-generation-firewall",
  },
  {
    cpe: "cpe:2.3:h:cisco:catalyst_9300:*:*:*:*:*:*:*:*",
    fixUri:
      "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-iosxe-webui-privesc-j22SaA4z",
    description:
      "IOS-XE software update patches the Web UI privilege escalation vulnerability (CVE-2023-20198) by hardening authentication on the HTTP server.",
    narrative:
      "Immediately disable the HTTP/HTTPS server on all Catalyst 9300 switches as an interim mitigation (no ip http server / no ip http secure-server). Schedule staged firmware rollout via Cisco DNA Center: test VLAN first, then non-clinical, then clinical switches. Each switch requires a 10-minute reboot. Update during change control window (Tuesday/Thursday 10 PM-2 AM). Post-upgrade: re-enable web UI only if required, verify VLAN connectivity and medical device network access.",
    upstreamApi:
      "https://www.cisco.com/c/en/us/products/switches/catalyst-9300-series-switches/index.html",
  },
  {
    cpe: "cpe:2.3:h:dell:optiplex_7090:*:*:*:*:*:*:*:*",
    fixUri:
      "https://www.connectwise.com/company/trust/security-bulletins/connectwise-screenconnect-23.9.8",
    description:
      "ConnectWise ScreenConnect upgrade to version 23.9.8 patches the authentication bypass vulnerability (CVE-2024-1709) on clinical workstations.",
    narrative:
      "Push ScreenConnect 23.9.8 update to all clinical workstations via SCCM/Intune. On-premise ScreenConnect server must be updated first. Verify all connected agents auto-update within 24 hours. For workstations that cannot be updated immediately, disable the ScreenConnect service. Post-update: verify remote support connectivity, audit for any unauthorized admin accounts created before patch.",
    upstreamApi:
      "https://www.connectwise.com/platform/unified-management/control",
  },
  {
    cpe: "cpe:2.3:h:siemens:magnetom_aera:*:*:*:*:*:*:*:*",
    fixUri: "https://www.siemens-healthineers.com/services/cybersecurity",
    description:
      "Network segmentation and DICOM TLS configuration to encrypt MRI scanner traffic and prevent passive interception of patient imaging data.",
    narrative:
      "Work with Siemens field service to enable DICOM TLS on the Magnetom Aera (requires Syngo software update). Configure dedicated radiology VLAN with ACLs restricting traffic to PACS servers only. Deploy network monitoring to detect any remaining unencrypted DICOM traffic. Verify image transfer performance is not degraded after TLS enablement. Radiologist validates image quality post-change.",
    upstreamApi:
      "https://www.siemens-healthineers.com/magnetic-resonance-imaging/1-5t-mri-scanner/magnetom-aera",
  },
];

async function clearDatabase() {
  console.log("🗑️  Clearing database...");

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

async function seedDeviceGroups() {
  console.log("\n🌱 Seeding device groups...");

  const deviceGroups = await Promise.all(
    SAMPLE_DEVICE_GROUPS.map((dg) =>
      prisma.deviceGroup.upsert({
        where: { cpe: dg.cpe },
        update: dg,
        create: dg,
      }),
    ),
  );

  console.log(`✅ Seeded ${deviceGroups.length} device groups`);
  return deviceGroups;
}

async function seedAssets(userId: string) {
  console.log("\n🌱 Seeding assets...");

  const assets = await Promise.all(
    SAMPLE_ASSETS.map(async (asset) => {
      const deviceGroup = await prisma.deviceGroup.findFirst({
        where: { cpe: asset.cpe },
      });

      if (!deviceGroup) {
        console.warn(`⚠️  No device group found for CPE: ${asset.cpe}`);
        return null;
      }

      return prisma.asset.create({
        data: {
          ip: asset.ip,
          networkSegment: asset.networkSegment,
          role: asset.role,
          upstreamApi: asset.upstreamApi,
          hostname: asset.hostname,
          macAddress: asset.macAddress,
          serialNumber: asset.serialNumber,
          location: asset.location,
          status: asset.status as AssetStatus,
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

async function seedVulnerabilities(userId: string) {
  console.log("\n🌱 Seeding vulnerabilities...");

  const vulnerabilities = await Promise.all(
    SAMPLE_VULNERABILITIES.map(async (vulnerability) => {
      const { cpe, ...data } = vulnerability;
      const deviceGroup = await prisma.deviceGroup.findFirst({
        where: { cpe },
      });

      if (!deviceGroup) {
        console.warn(`⚠️  No device group found for CPE: ${vulnerability.cpe}`);
        return null;
      }

      return prisma.vulnerability.create({
        data: {
          ...data,
          userId,
          affectedDeviceGroups: {
            connect: { id: deviceGroup.id },
          },
        },
      });
    }),
  );

  const successfulVulnerabilities = vulnerabilities.filter((v) => v !== null);
  console.log(`✅ Seeded ${successfulVulnerabilities.length} vulnerabilities`);
  return successfulVulnerabilities;
}

async function seedDeviceArtifacts(userId: string) {
  console.log("\n🌱 Seeding device artifacts...");

  const deviceArtifacts = await Promise.all(
    SAMPLE_DEVICE_ARTIFACTS.map(async (deviceArtifact) => {
      const deviceGroup = await prisma.deviceGroup.findFirst({
        where: { cpe: deviceArtifact.cpe },
      });

      if (!deviceGroup) {
        console.warn(`⚠️  No device group found for CPE: ${deviceArtifact.cpe}`);
        return null;
      }

      // Create the DeviceArtifact
      const createdDeviceArtifact = await prisma.deviceArtifact.create({
        data: {
          role: deviceArtifact.role,
          description: deviceArtifact.description,
          deviceGroupId: deviceGroup.id,
          userId,
        },
      });

      // Create ArtifactWrapper for this device artifact
      const wrapper = await prisma.artifactWrapper.create({
        data: {
          deviceArtifactId: createdDeviceArtifact.id,
          userId,
        },
      });

      // Create artifacts for dockerUrl and downloadUrl if they exist
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

      // Set the latest artifact if we created any
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
        where: { cpe: remediation.cpe },
      });

      if (!deviceGroup) {
        console.warn(`⚠️  No device group found for CPE: ${remediation.cpe}`);
        return null;
      }

      const vulnerability = await prisma.vulnerability.findFirst({
        where: {
          affectedDeviceGroups: {
            some: { id: deviceGroup.id },
          },
        },
      });

      if (!vulnerability) {
        console.warn(`⚠️  No vulnerability found for CPE: ${remediation.cpe}`);
        return null;
      }

      // Create the Remediation with affectedDeviceGroups and vulnerability
      const createdRemediation = await prisma.remediation.create({
        data: {
          description: remediation.description,
          narrative: remediation.narrative,
          upstreamApi: remediation.upstreamApi,
          vulnerabilityId: vulnerability.id,
          userId,
          affectedDeviceGroups: {
            connect: { id: deviceGroup.id },
          },
        },
      });

      // Create ArtifactWrapper for this remediation
      const wrapper = await prisma.artifactWrapper.create({
        data: {
          remediationId: createdRemediation.id,
          userId,
        },
      });

      // Create artifact for the fixUri
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

      // Set as latest artifact
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
    include: { affectedDeviceGroups: true },
  });

  const issues = [];

  for (const asset of assets) {
    for (const vulnerability of vulnerabilities) {
      const isAffected = vulnerability.affectedDeviceGroups.some(
        (dg) => dg.id === asset.deviceGroupId,
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

async function main() {
  console.log("🌱 Starting database seed...\n");

  try {
    const shouldClear = process.env.SEED_CLEAR_DB === "true";
    if (shouldClear) {
      await clearDatabase();
    }

    const user = await createOrGetSeedUser();

    await seedDeviceGroups();
    await seedAssets(user.id);
    await seedVulnerabilities(user.id);
    await seedDeviceArtifacts(user.id);
    await seedRemediations(user.id);
    await seedIssues();

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
