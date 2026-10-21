import type { MatchKeysRow } from "../contract";

function conflictReason(
  row: MatchKeysRow,
  earlierRowWithSerial: number | undefined,
  earlierRowWithMac: number | undefined,
): string | null {
  if (row.manufacturer === null) return "Manufacturer is missing";
  if (row.product === null) return "Model is missing";
  if (earlierRowWithSerial !== undefined) {
    return `Serial also used by row ${earlierRowWithSerial} in this file`;
  }
  if (earlierRowWithMac !== undefined) {
    return `MAC address also used by row ${earlierRowWithMac} in this file`;
  }
  return null;
}

export function findInFileConflicts(rows: MatchKeysRow[]): Map<number, string> {
  const reasonByRowNumber = new Map<number, string>();
  const firstRowBySerial = new Map<string, number>();
  const firstRowByMac = new Map<string, number>();

  for (const row of rows) {
    const earlierRowWithSerial =
      row.serialNumber === null
        ? undefined
        : firstRowBySerial.get(row.serialNumber);
    const earlierRowWithMac =
      row.macAddress === null ? undefined : firstRowByMac.get(row.macAddress);

    const reason = conflictReason(row, earlierRowWithSerial, earlierRowWithMac);
    if (reason !== null) reasonByRowNumber.set(row.rowNumber, reason);

    if (row.serialNumber !== null && earlierRowWithSerial === undefined) {
      firstRowBySerial.set(row.serialNumber, row.rowNumber);
    }
    if (row.macAddress !== null && earlierRowWithMac === undefined) {
      firstRowByMac.set(row.macAddress, row.rowNumber);
    }
  }

  return reasonByRowNumber;
}
