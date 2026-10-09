// The prisma seed scripts import this file and run outside Next.js, so it
// must not import "server-only" code.

export interface DeviceTypeSeed {
  slug: string;
  displayName: string;
  /** Lowercase strings that integrations send, other than the lowercase displayName. */
  nameMappings: string[];
}

export const DEVICE_TYPES: DeviceTypeSeed[] = [
  { slug: "infusion-pump", displayName: "Infusion Pump", nameMappings: [] },
  { slug: "patient-monitor", displayName: "Patient Monitor", nameMappings: [] },
  { slug: "ventilator", displayName: "Ventilator", nameMappings: [] },
  { slug: "lab-equipment", displayName: "Lab Equipment", nameMappings: [] },
  { slug: "x-ray", displayName: "X-Ray", nameMappings: [] },
  {
    slug: "computed-tomography",
    displayName: "Computed Tomography (CT)",
    nameMappings: [],
  },
  {
    slug: "magnetic-resonance-imaging",
    displayName: "Magnetic Resonance Imaging (MRI)",
    nameMappings: [],
  },
  { slug: "ultrasound", displayName: "Ultrasound", nameMappings: [] },
  { slug: "mammography", displayName: "Mammography", nameMappings: [] },
  { slug: "angiography", displayName: "Angiography", nameMappings: [] },
  {
    slug: "molecular-imaging",
    displayName: "Molecular Imaging",
    nameMappings: ["molecular imaging spect"],
  },
  {
    slug: "imaging-workstation",
    displayName: "Imaging Workstation",
    nameMappings: [],
  },
  { slug: "image-viewer", displayName: "Image Viewer", nameMappings: [] },
  {
    slug: "imaging-platform",
    displayName: "Imaging Platform",
    nameMappings: [],
  },
  {
    slug: "image-archive-pacs",
    displayName: "Image Archive / PACS",
    nameMappings: [],
  },
  { slug: "firewall", displayName: "Firewall", nameMappings: [] },
  { slug: "network-switch", displayName: "Network Switch", nameMappings: [] },
];

/**
 * teamplay Fleet product names, as Fleet sends them in `productName`, and the
 * slug of their device type. A seeded type overwrites the type that a sync
 * found from the Fleet modality label.
 *
 * Fleet labels every syngo product "Syngo", and labels CT workstations
 * "Computed Tomography (CT)". Those products need an entry here, or they get
 * no type or the CT type.
 */
export const FLEET_PRODUCT_DEVICE_TYPES: Record<string, string> = {
  "MAGNETOM Espree": "magnetic-resonance-imaging",
  "MAGNETOM Aera": "magnetic-resonance-imaging",
  "ACUSON Cypress CV System": "ultrasound",
  "ACUSON Sequoia S512": "ultrasound",
  "ACUSON Cypress V20": "ultrasound",
  "syngo.via View&GO": "image-viewer",
  "Desktop Connector": "image-viewer",
  "syngo WebSpace": "image-viewer",
  "Syngo Carbon Space": "imaging-platform",
  "Network Infranode (Sys-label)": "imaging-platform",
  "syngo.share": "image-archive-pacs",
  "DICOM Proxy": "image-archive-pacs",
  "syngo MM Workplace": "imaging-workstation",
  "LEONARDO Multimodality Workstation": "imaging-workstation",
};
