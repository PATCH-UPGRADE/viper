import prisma from "@/lib/db";
import { SIEMENS_HEALTHINEERS } from "@/lib/manufacturer-catalog";
import { requireDeviceTypeId } from "../production/device-types";
import {
  cpeVersionStatus,
  type DeviceIds,
  matchingForDevice,
  normalizeVersion,
  upsertManufacturer,
  upsertProduct,
  upsertVersion,
} from "./canonical-identity";

// Sample devices — one entry per unique CPE. `deviceType` says what the product
// is, and the asset role says how one asset uses it: Centricity PACS-IW is a
// PACS for both the PACS server and the reading workstations. Products that
// are not one kind of device (OS platforms, a general office PC) have none.
const SAMPLE_DEVICES: {
  cpe: string;
  manufacturer: string;
  modelName: string;
  version: string;
  deviceType?: string;
}[] = [
  // ── CT Scanner ──────────────────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:gehealthcare:brightspeed_elite_select:-:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "BrightSpeed Elite Select",
    deviceType: "computed-tomography",
    version: "unknown",
  },
  // ── CT Acquisition Workstation Software ─────────────────────────────────────
  {
    cpe: "cpe:2.3:a:gehealthcare:advantage_workstation:4.6:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "Advantage Workstation",
    deviceType: "imaging-workstation",
    version: "4.6",
  },
  // ── PACS Server Software (versioned) ────────────────────────────────────────
  {
    cpe: "cpe:2.3:a:gehealthcare:centricity_pacs_iw:5.0:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "Centricity PACS-IW",
    deviceType: "image-archive-pacs",
    version: "5.0",
  },
  // ── Radiology Diagnostic Workstation Software (viewer, unversioned) ──────────
  {
    cpe: "cpe:2.3:a:gehealthcare:centricity_pacs_iw:-:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "Centricity PACS-IW",
    deviceType: "image-archive-pacs",
    version: "unknown",
  },
  // ── EOL OS platforms (exist for vulnerability targeting; no assets use these
  //    as primary CPE, but EternalBlue affectedDeviceGroups connects here too)
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
    deviceType: "firewall",
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
    deviceType: "ultrasound",
    version: "R7",
  },
  // ── X-Ray / DR Node ─────────────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:gehealthcare:optima_xr200amx:-:*:*:*:*:*:*:*",
    manufacturer: "GE Healthcare",
    modelName: "Optima XR200amx",
    deviceType: "x-ray",
    version: "N/A",
  },
  // ── Network Switch ───────────────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:cisco:catalyst_2960s-24ts-l:-:*:*:*:*:*:*:*",
    manufacturer: "Cisco",
    modelName: "Catalyst 2960S-24TS-L",
    deviceType: "network-switch",
    version: "N/A",
  },
  // ── Patient Monitor ──────────────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:philips:intellivue_mp5:-:*:*:*:*:*:*:*",
    manufacturer: "Philips",
    modelName: "IntelliVue MP5",
    deviceType: "patient-monitor",
    version: "N/A",
  },
  // ── Infusion Pump ────────────────────────────────────────────────────────────
  {
    cpe: "cpe:2.3:h:baxter:sigma_spectrum:-:*:*:*:*:*:*:*",
    manufacturer: "Baxter",
    modelName: "Sigma Spectrum",
    deviceType: "infusion-pump",
    version: "N/A",
  },
  // ── Siemens Healthineers imaging —
  {
    cpe: "cpe:2.3:h:siemens:magnetom_sola:-:*:*:*:*:*:*:*",
    manufacturer: SIEMENS_HEALTHINEERS.canonicalDisplayName,
    modelName: "MAGNETOM Sola",
    deviceType: "magnetic-resonance-imaging",
    version: "N/A",
  },
  {
    cpe: "cpe:2.3:h:siemens:somatom_go.top:-:*:*:*:*:*:*:*",
    manufacturer: SIEMENS_HEALTHINEERS.canonicalDisplayName,
    modelName: "SOMATOM go.Top",
    deviceType: "computed-tomography",
    version: "N/A",
  },
  // ── MedISAO integration test device ─────────────────────────────────────────
  // Matches the ViperMD / ViperDevice channel the MedISAO dev instance
  // publishes on, so its advisories land on a real asset's Advisories tab.
  // The version is exact so a VERS range like "vers:semver/<=6.0.2" resolves.
  {
    cpe: "cpe:2.3:h:vipermd:viperdevice:6.0.2:*:*:*:*:*:*:*",
    manufacturer: "ViperMD",
    modelName: "ViperDevice",
    deviceType: "ventilator",
    version: "6.0.2",
  },
];

type SampleDevice = DeviceIds & {
  versionStatus: "UNKNOWN" | "NOT_APPLICABLE" | "KNOWN";
};

let deviceTypeIds: Promise<Map<string, string>> | undefined;

/**
 * The device ids of a sample CPE, from SAMPLE_DEVICES. Upserts the
 * manufacturer, product, and version, so any seed can call it in any order.
 * Returns null for a CPE that no sample device has.
 */
export async function deviceForSampleCpe(
  cpe: string,
): Promise<SampleDevice | null> {
  const sample = SAMPLE_DEVICES.find((device) => device.cpe === cpe);
  if (!sample) return null;

  // The production seed runs first and creates the device types.
  deviceTypeIds ??= prisma.deviceType
    .findMany({ select: { id: true, slug: true } })
    .then((rows) => new Map(rows.map(({ id, slug }) => [slug, id])));
  const deviceTypeId = sample.deviceType
    ? requireDeviceTypeId(
        await deviceTypeIds,
        sample.deviceType,
        sample.modelName,
      )
    : null;

  const manufacturer = await upsertManufacturer(sample.manufacturer);
  const product = await upsertProduct(
    manufacturer.id,
    sample.modelName,
    deviceTypeId,
  );
  // versionStatus follows the CPE's version token; only KNOWN devices get a
  // version row (NOT_APPLICABLE / UNKNOWN devices have versionId = null).
  const versionStatus = cpeVersionStatus(sample.cpe);
  const versionName =
    versionStatus === "KNOWN"
      ? (normalizeVersion(sample.version) ?? sample.cpe.split(":")[5])
      : null;
  const version = versionName
    ? await upsertVersion(product.id, versionName)
    : null;

  return {
    manufacturerId: manufacturer.id,
    productId: product.id,
    versionId: version?.id ?? null,
    versionStatus,
  };
}

export async function seedSampleDevices() {
  console.log("\n🌱 Seeding sample devices...");

  // Sequential to keep find-or-create of the (manufacturer, product, version)
  // identity race-free.
  for (const sample of SAMPLE_DEVICES) await deviceForSampleCpe(sample.cpe);

  console.log(`✅ Seeded ${SAMPLE_DEVICES.length} sample devices`);
}

// Resolve sample CPEs to shared DeviceGroupMatching ids, so workflow ASSET
// nodes can link a device class relationally instead of by CPE.
export async function matchingIdsForCpes(cpes: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const cpe of cpes) {
    const device = await deviceForSampleCpe(cpe);
    if (!device) {
      console.warn(
        `⚠️  No sample device for CPE ${cpe}; skipping matching link`,
      );
      continue;
    }
    const matchingId = await matchingForDevice(device);
    if (matchingId) ids.push(matchingId);
  }
  return [...new Set(ids)];
}
