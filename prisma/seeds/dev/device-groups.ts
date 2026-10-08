import prisma from "@/lib/db";
import { SIEMENS_HEALTHINEERS } from "@/lib/manufacturer-catalog";
import { requireDeviceTypeId } from "../production/device-types";
import {
  cpeVersionStatus,
  normalizeVersion,
  upsertManufacturer,
  upsertProduct,
  upsertVersion,
} from "./canonical-identity";

// Device groups — one entry per unique CPE. `deviceType` says what the product
// is, and the asset role says how one asset uses it: Centricity PACS-IW is a
// PACS for both the PACS server and the reading workstations. Products that
// are not one kind of device (OS platforms, a general office PC) have none.
const SAMPLE_DEVICE_GROUPS: {
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

export async function seedDeviceGroups() {
  console.log("\n🌱 Seeding device groups...");

  // The production seed runs first and creates the device types.
  const deviceTypeIds = new Map(
    (
      await prisma.deviceType.findMany({ select: { id: true, slug: true } })
    ).map(({ id, slug }) => [slug, id]),
  );

  // Sequential to keep find-or-create of the (manufacturer, product, version) identity
  // race-free.
  const deviceGroups = [];
  for (const dg of SAMPLE_DEVICE_GROUPS) {
    const manufacturer = await upsertManufacturer(dg.manufacturer);
    const deviceTypeId = dg.deviceType
      ? requireDeviceTypeId(deviceTypeIds, dg.deviceType, dg.modelName)
      : null;
    const product = await upsertProduct(dg.modelName, deviceTypeId);
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
        manufacturerId: manufacturer.id,
        productId: product.id,
        versionId: version?.id ?? null,
        versionStatus,
      },
    });

    const group =
      existing ??
      (await prisma.deviceGroup.create({
        data: {
          manufacturerId: manufacturer.id,
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
