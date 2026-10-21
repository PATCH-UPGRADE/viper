import { normalizeIdentifier } from "@/features/integrations/platforms/medisao/vulnerabilities";
import type { ReleaseScalars } from "@/features/remediations/release";
import { RemediationCategory } from "@/generated/prisma";
import { asDate } from "@/lib/date-utils";
import {
  externalIdOf,
  type FleetAdvisory,
  parseCveIds,
} from "../advisories/advisories";
import { buildText } from "../utils";
import { type FleetAffectedProduct, parseProductsAffected } from "./products";

export interface FleetRemediationItem {
  externalId: string;
  description: string;
  narrative: string | null;
  products: FleetAffectedProduct[];
  cveIds: string[];
  release: ReleaseScalars;
}

const describeFix = (products: FleetAffectedProduct[]): string | null => {
  const lines = products
    .filter((p) => p.fixedVersion)
    .map(
      (p) =>
        `Update ${p.product}${p.versionLine ? `${p.versionLine}` : ""} to ${p.fixedVersion} or later.`,
    );
  return lines.length > 0 ? lines.join("\n") : null;
};

export function toRemediationItem(raw: FleetAdvisory): FleetRemediationItem {
  const products = parseProductsAffected(raw.productsAffected);
  const label = buildText(raw.advisoryId);
  const title = buildText(raw.title) ?? `Fleet advisory ${raw.id}`;
  return {
    externalId: externalIdOf(raw),
    description: label ? `${label} : ${title}` : title,
    narrative: describeFix(products),
    products,
    cveIds: [...new Set(parseCveIds(raw.cveIds).map(normalizeIdentifier))],
    release: {
      category: RemediationCategory.SOFTWARE_UPDATE,
      isSecurityUpdate: true,
      publishedAt: asDate(raw.activationDate)?.toISOString() ?? null,
    },
  };
}
