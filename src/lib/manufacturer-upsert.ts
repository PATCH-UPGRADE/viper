import prisma from "@/lib/db";
import type { ManufacturerEntry } from "@/lib/manufacturer-catalog";

export interface StoredManufacturer {
  id: string;
  canonicalName: string;
  nameMappings: string[];
}

type ManufacturerNames = Pick<
  StoredManufacturer,
  "canonicalName" | "nameMappings"
>;

export type ManufacturerWrite =
  | { kind: "create"; manufacturer: ManufacturerEntry }
  | {
      kind: "addAliases";
      id: string;
      canonicalName: string;
      aliases: string[];
    };

export interface NameConflict {
  manufacturer: string;
  name: string;
  claimedBy: string;
}

export interface ManufacturerUpsertPlan {
  writes: ManufacturerWrite[];
  unchanged: string[];
  conflicts: NameConflict[];
}

const claimsName = (manufacturer: ManufacturerNames, name: string) =>
  manufacturer.canonicalName === name ||
  manufacturer.nameMappings.includes(name);

export function planManufacturerUpserts(
  entries: ManufacturerEntry[],
  storedManufacturers: StoredManufacturer[],
): ManufacturerUpsertPlan {
  const manufacturersInDatabase = storedManufacturers.map((stored) => ({
    ...stored,
    nameMappings: [...stored.nameMappings],
  }));
  const manufacturersToCreate: ManufacturerNames[] = [];
  const plan: ManufacturerUpsertPlan = {
    writes: [],
    unchanged: [],
    conflicts: [],
  };

  const findClaimant = (name: string) =>
    [...manufacturersInDatabase, ...manufacturersToCreate].find(
      (manufacturer) => claimsName(manufacturer, name),
    );

  const keepUnclaimedAliases = (
    entry: ManufacturerEntry,
    candidateAliases: string[],
  ) => {
    const unclaimedAliases: string[] = [];
    for (const alias of candidateAliases) {
      const claimant = findClaimant(alias);
      if (claimant) {
        plan.conflicts.push({
          manufacturer: entry.canonicalName,
          name: alias,
          claimedBy: claimant.canonicalName,
        });
      } else {
        unclaimedAliases.push(alias);
      }
    }
    return unclaimedAliases;
  };

  for (const entry of entries) {
    const distinctAliases = [...new Set(entry.nameMappings)].filter(
      (alias) => alias !== entry.canonicalName,
    );
    const storedMatch = manufacturersInDatabase.find(
      (stored) => stored.canonicalName === entry.canonicalName,
    );

    if (!storedMatch) {
      const claimant = findClaimant(entry.canonicalName);
      if (claimant) {
        plan.conflicts.push({
          manufacturer: entry.canonicalName,
          name: entry.canonicalName,
          claimedBy: claimant.canonicalName,
        });
        continue;
      }
      const newManufacturer = {
        ...entry,
        nameMappings: keepUnclaimedAliases(entry, distinctAliases),
      };
      plan.writes.push({ kind: "create", manufacturer: newManufacturer });
      manufacturersToCreate.push(newManufacturer);
      continue;
    }

    const missingAliases = distinctAliases.filter(
      (alias) => !storedMatch.nameMappings.includes(alias),
    );
    const aliasesToAdd = keepUnclaimedAliases(entry, missingAliases);
    if (aliasesToAdd.length === 0) {
      plan.unchanged.push(entry.canonicalName);
      continue;
    }
    plan.writes.push({
      kind: "addAliases",
      id: storedMatch.id,
      canonicalName: storedMatch.canonicalName,
      aliases: aliasesToAdd,
    });
    storedMatch.nameMappings.push(...aliasesToAdd);
  }

  return plan;
}

export async function upsertManufacturers(
  entries: ManufacturerEntry[],
): Promise<ManufacturerUpsertPlan> {
  const storedManufacturers = await prisma.manufacturer.findMany({
    select: { id: true, canonicalName: true, nameMappings: true },
  });
  const plan = planManufacturerUpserts(entries, storedManufacturers);

  for (const write of plan.writes) {
    if (write.kind === "create") {
      await prisma.manufacturer.create({ data: write.manufacturer });
    } else {
      await prisma.manufacturer.update({
        where: { id: write.id },
        data: { nameMappings: { push: write.aliases } },
      });
    }
  }

  return plan;
}

export function logManufacturerUpsertPlan(plan: ManufacturerUpsertPlan) {
  const created = plan.writes.filter((write) => write.kind === "create");
  const givenAliases = plan.writes.filter(
    (write) => write.kind === "addAliases",
  );
  const summaryIcon = plan.conflicts.length > 0 ? "⚠️ " : "✅";
  console.log(
    `${summaryIcon} Manufacturers: ${created.length} created, ${givenAliases.length} given new aliases, ${plan.unchanged.length} unchanged, ${plan.conflicts.length} names skipped`,
  );
  for (const conflict of plan.conflicts) {
    console.warn(
      `⚠️  Skipped "${conflict.name}" for ${conflict.manufacturer}: already claimed by ${conflict.claimedBy}`,
    );
  }
}
