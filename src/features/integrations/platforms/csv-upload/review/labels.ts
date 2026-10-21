import type { AssetImportField } from "../contract";

export const FIELD_LABELS: Record<AssetImportField, string> = {
  deviceType: "Device type",
  manufacturer: "Manufacturer",
  product: "Model",
  version: "Version",
  serialNumber: "Serial number",
  ip: "IP address",
  macAddress: "MAC address",
  hostname: "Hostname",
  networkSegment: "Network segment",
  status: "Status",
  facility: "Facility",
  building: "Building",
  floor: "Floor",
  room: "Room",
};

export const FIELD_PLURALS: Record<AssetImportField, string> = {
  deviceType: "device types",
  manufacturer: "manufacturers",
  product: "models",
  version: "versions",
  serialNumber: "serial numbers",
  ip: "IP addresses",
  macAddress: "MAC addresses",
  hostname: "hostnames",
  networkSegment: "network segments",
  status: "statuses",
  facility: "facilities",
  building: "buildings",
  floor: "floors",
  room: "rooms",
};

const STARTS_WITH_AN_ACRONYM = /^[A-Z]{2}/;

export const fieldNameInSentence = (field: AssetImportField): string => {
  const label = FIELD_LABELS[field];
  return STARTS_WITH_AN_ACRONYM.test(label) ? label : label.toLowerCase();
};

export const formatCount = (count: number): string =>
  count.toLocaleString("en-US");

export const formatFileSize = (bytes: number): string => {
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Math.max(1, Math.round(kilobytes))} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
};

export const joinWithAnd = (items: string[]): string => {
  if (items.length <= 1) return items.join("");
  const allButLast = items.slice(0, -1).join(", ");
  return `${allButLast} and ${items[items.length - 1]}`;
};

export const withArticle = (noun: string): string =>
  /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;

export const rowLabel = (row: {
  deviceType: string | null;
  manufacturer: string | null;
  product: string | null;
}): string => {
  const makeAndModel = [row.manufacturer, row.product]
    .filter(Boolean)
    .join(" ");
  return row.deviceType ?? (makeAndModel || "—");
};
