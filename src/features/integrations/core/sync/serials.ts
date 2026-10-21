const PLACEHOLDER_SERIALS = new Set(["n/a", "na", "none", "unknown", "-", "0"]);

export const normalizeSerial = (
  raw: string | null | undefined,
): string | null => {
  const trimmed = raw?.trim();
  if (!trimmed || PLACEHOLDER_SERIALS.has(trimmed.toLowerCase())) return null;
  return trimmed;
};

export function computeWeakSerials(
  items: ReadonlyArray<{ serialNumber: string | null }>,
): Set<string> {
  const seen = new Set<string>();
  const weak = new Set<string>();
  for (const item of items) {
    if (!item.serialNumber) continue;
    if (seen.has(item.serialNumber)) weak.add(item.serialNumber);
    seen.add(item.serialNumber);
  }
  return weak;
}
