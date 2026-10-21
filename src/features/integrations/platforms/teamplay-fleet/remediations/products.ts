// parse the response from fleet's api productsAffected value
// e.g productsAffected: "syngo.plaza VB30E\nAll versions < VB30E_HF07\naffected by CVE-2024-52334"
export interface FleetAffectedProduct {
  product: string;
  versionLine: string | null;
  fixedVersion: string | null;
}

const PRODUCT_LINE = /^(.*\S)\s+(V[A-Z]\d{2}[A-Z]?)$/;
const BELOW = /^all versions\s*<\s*(\S+)/i;

/**
 * Fleet sends affected products as free text
 */
export function parseProductsAffected(
  text: string | null | undefined,
): FleetAffectedProduct[] {
  const products: FleetAffectedProduct[] = [];
  let current: FleetAffectedProduct | null = null;

  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line || /^affected by\b/i.test(line)) continue;

    const below = line.match(BELOW);
    if (below) {
      if (current) current.fixedVersion = below[1];
      continue;
    }
    if (/^all versions\b/i.test(line)) continue;

    const parts = line.match(PRODUCT_LINE);
    current = {
      product: parts ? parts[1] : line,
      versionLine: parts ? parts[2] : null,
      fixedVersion: null,
    };
    products.push(current);
  }
  return products;
}

/** The matching range for a product: every version below the fix */
export const versionRangeOf = (p: FleetAffectedProduct): string | null =>
  p.fixedVersion ? `vers:generic/<${p.fixedVersion}` : null;
