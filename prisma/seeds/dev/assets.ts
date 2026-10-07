import type { AssetStatus } from "@/generated/prisma";
import prisma from "@/lib/db";

// Used to simulate imaging device utilization throughout the week
// Mainly for work order scheduling
const IMAGING_UTILIZATION = Array.from({ length: 7 }, (_, day) => {
  const weekend = day >= 5;
  const hours: Record<string, number> = {};
  for (let hour = 0; hour < 24; hour++) {
    if (hour >= 7 && hour <= 17) hours[String(hour)] = weekend ? 25 : 85;
    else if (hour === 6 || hour === 18) hours[String(hour)] = weekend ? 5 : 40;
    else hours[String(hour)] = 0;
  }
  return hours;
});

// Individual hospital assets
const SAMPLE_ASSETS = [
  // ── Imaging Devices (IMAGING-VLAN-40) ───────────────────────────────────────
  {
    id: "rad-ct-001",
    ip: "10.40.1.10",
    cpe: "cpe:2.3:h:gehealthcare:brightspeed_elite_select:-:*:*:*:*:*:*:*",
    role: "CT Scanner",
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
    networkSegment: "PACS-VLAN-41",
    hostname: "WS-RADIOLOGY-001",
    macAddress: "00:1A:2B:3C:51:20",
    serialNumber: "HP-Z400-2016-001",
    location: {
      building: "Imaging Department",
      room: "Radiology Reading Room",
    },
    status: "Active",
    utilization: IMAGING_UTILIZATION,
  },
  {
    id: "rad-rws-002",
    ip: "10.40.2.21",
    cpe: "cpe:2.3:a:gehealthcare:centricity_pacs_iw:-:*:*:*:*:*:*:*",
    role: "Radiology Diagnostic Workstation",
    networkSegment: "PACS-VLAN-41",
    hostname: "WS-RADIOLOGY-002",
    macAddress: "00:1A:2B:3C:51:21",
    serialNumber: "HP-Z400-2016-002",
    location: {
      building: "Imaging Department",
      room: "Radiology Reading Room",
    },
    status: "Active",
    utilization: IMAGING_UTILIZATION,
  },
  // ── ED Image Viewer (ED-VLAN-50) ─────────────────────────────────────────────
  // Dell OptiPlex 790, Windows 7
  {
    id: "rad-ed-001",
    ip: "10.50.1.10",
    cpe: "cpe:2.3:h:dell:optiplex_790:-:*:*:*:*:*:*:*",
    role: "ED Image Viewer / Workstation",
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
  // ── Siemens Healthineers imaging (IMAGING-VLAN-40) ──────────────────────────
  {
    id: "rad-mri-001",
    ip: "10.40.1.60",
    cpe: "cpe:2.3:h:siemens:magnetom_sola:-:*:*:*:*:*:*:*",
    role: "MRI Scanner",
    networkSegment: "IMAGING-VLAN-40",
    hostname: "MR-MAGNETOM-001",
    macAddress: "00:1A:2B:3C:50:60",
    serialNumber: "SH-MAG-2021-001",
    location: {
      building: "Imaging Department",
      room: "MRI Suite",
    },
    status: "Active",
    utilization: IMAGING_UTILIZATION,
  },
  {
    id: "rad-ct-002",
    ip: "10.40.1.61",
    cpe: "cpe:2.3:h:siemens:somatom_go.top:-:*:*:*:*:*:*:*",
    role: "CT Scanner",
    networkSegment: "IMAGING-VLAN-40",
    hostname: "CT-SOMATOM-001",
    macAddress: "00:1A:2B:3C:50:61",
    serialNumber: "SH-SOM-2022-001",
    location: {
      building: "Imaging Department",
      room: "CT Suite 2",
    },
    status: "Active",
    utilization: IMAGING_UTILIZATION,
  },
  // ── MedISAO integration test device ─────────────────────────────────────────
  // The only asset the MedISAO dev channel can reach. Without it every
  // advisory that syncs is stored but matches nothing in this hospital.
  {
    id: "medisao-test-001",
    ip: "10.90.1.10",
    cpe: "cpe:2.3:h:vipermd:viperdevice:6.0.2:*:*:*:*:*:*:*",
    role: "Ventilator",
    networkSegment: "BIOMED-VLAN-90",
    hostname: "VENT-VIPERMD-001",
    macAddress: "00:1A:2B:3C:90:10",
    serialNumber: "VMD-VD-2026-001",
    location: {
      building: "Critical Care",
      room: "ICU Bay 1",
    },
    status: "Active",
  },
];

export async function seedAssets(userId: string) {
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
        update: { utilization: asset.utilization },
        create: {
          ...("id" in asset && asset.id ? { id: asset.id } : {}),
          ip: asset.ip,
          networkSegment: asset.networkSegment,
          role: asset.role,
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
