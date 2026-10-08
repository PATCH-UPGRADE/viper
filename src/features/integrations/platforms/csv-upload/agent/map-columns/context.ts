import {
  ASSET_IMPORT_FIELDS,
  type AssetImportField,
  MAX_CELL_LENGTH,
} from "../../contract";

interface FieldGuide {
  meaning: string;
  examples: string;
}

export const FIELD_GUIDE: Record<AssetImportField, FieldGuide> = {
  deviceType: {
    meaning: "What kind of device it is, in plain words.",
    examples: "Infusion pump, Patient monitor, CT scanner",
  },
  manufacturer: {
    meaning:
      "The company that made the device. Not the vendor that services it.",
    examples: "GE Healthcare, BD, Philips, Baxter",
  },
  product: {
    meaning: "The model or product name the manufacturer sells the device as.",
    examples: "Alaris 8015, IntelliVue MP5, LOGIQ e",
  },
  version: {
    meaning: "The software or firmware version running on the device.",
    examples: "9.33.1, R4.2, VF12B",
  },
  serialNumber: {
    meaning:
      "The serial number the manufacturer gave this one device. Not an inventory ID the hospital assigned.",
    examples: "BX-SS-2021-014, SN4KJ29017, 12345678",
  },
  ip: {
    meaning: "The device's IPv4 or IPv6 network address.",
    examples: "10.20.4.15, fe80::1c2a",
  },
  macAddress: {
    meaning: "The hardware address of the device's network card.",
    examples: "00:1A:2B:3C:4D:5E, 00-1a-2b-3c-4d-5e",
  },
  hostname: {
    meaning: "The device's name on the network.",
    examples: "MON-MP5-003, pump-icu-12.hospital.local",
  },
  networkSegment: {
    meaning: "The VLAN, subnet or network zone the device sits on.",
    examples: "VLAN 40, 10.20.4.0/24, Biomed-ICU",
  },
  status: {
    meaning: "Whether the device is in service, being repaired or retired.",
    examples: "Active, In Service, Out for repair, Retired, Y, N",
  },
  facility: {
    meaning: "The hospital or campus the device is at.",
    examples: "Main Campus, North Clinic",
  },
  building: {
    meaning: "The building inside the facility.",
    examples: "Tower A, Building 3",
  },
  floor: {
    meaning: "The floor or level inside the building.",
    examples: "4, Level 2, B1",
  },
  room: {
    meaning: "The room, bay or unit inside the building.",
    examples: "ICU-12, OR 3, Bay 4",
  },
};

const fieldGuideLines = ASSET_IMPORT_FIELDS.map((field) => {
  const { meaning, examples } = FIELD_GUIDE[field];
  return `- ${field}: ${meaning} Examples: ${examples}.`;
}).join("\n");

export const SYSTEM_PROMPT = `You read the header row and up to five sample rows of a hospital's medical device inventory spreadsheet, exported from a maintenance system. For each VIPER asset field, pick the one column that holds it, or null when no column does.

VIPER asset fields:
${fieldGuideLines}

Rules:
- Judge by the values in the sample rows, not only by the header text.
- A wrong mapping is worse than none. Leave a field null when you are unsure.
- Never use one column for two of these fields: manufacturer, product, serialNumber, macAddress, hostname. They identify the device.
- Hospitals often give each device their own inventory ID, in a column headed something like Asset Tag, Equipment #, Asset ID or Control Number. It is not the manufacturer's serial number and VIPER has no field for it. Leave that column unmapped, and never use it as serialNumber.
- A column no field describes, such as a department, a cost center or a date, stays unmapped.
- Use "Matched" only when the header and the sample values both clearly fit the field. Otherwise use "NeedsReview".

Example spreadsheet:

| Asset Tag | Device Description | Mfr | Model | SW Rev | Serial No | IP Address | Bldg | Dept | In Service |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BIO-0417 | Infusion pump | Baxter | Sigma Spectrum | 8.00.01 | BX-SS-2021-014 | 10.20.4.15 | Tower A | ICU | Y |

Example answer:
- deviceType: Device Description, Matched
- manufacturer: Mfr, Matched
- product: Model, Matched
- version: SW Rev, Matched
- serialNumber: Serial No, Matched
- ip: IP Address, Matched
- building: Bldg, Matched
- status: In Service, NeedsReview, because Y and N need a person to confirm what they mean
- every other field: null
- Asset Tag and Dept are used by no field`;

const tableCell = (value: string | undefined): string =>
  (value ?? "").slice(0, MAX_CELL_LENGTH).replaceAll("|", "/");

export function buildColumnPrompt(
  headers: string[],
  sampleRows: Record<string, string>[],
): string {
  const headerLine = `| ${headers.map(tableCell).join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const sampleLines = sampleRows.map(
    (row) =>
      `| ${headers.map((header) => tableCell(row[header])).join(" | ")} |`,
  );
  return [
    "Columns and sample rows:",
    "",
    headerLine,
    dividerLine,
    ...sampleLines,
  ].join("\n");
}
