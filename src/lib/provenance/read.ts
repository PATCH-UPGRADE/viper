import "server-only";
import type { Observation, ProvenanceEntityType } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { EntitySource, EntitySources } from "./types";

type ObservationGroup = Pick<
  Observation,
  "source" | "integrationId" | "integrationName" | "actorUserId"
>;

/**
 * Attaches who has written each entity, and who created it. Call it for the
 * rows that are returned, and not for every row a query loads to sort them.
 */
export async function attachSources<T extends { id: string }>(
  entityType: ProvenanceEntityType,
  items: T[],
): Promise<(T & EntitySources)[]> {
  if (items.length === 0) return [];

  const groups = await prisma.observation.groupBy({
    by: [
      "entityId",
      "kind",
      "source",
      "integrationId",
      "integrationName",
      "actorUserId",
    ],
    where: { entityType, entityId: { in: items.map(({ id }) => id) } },
    _max: { seq: true },
    orderBy: { _max: { seq: "desc" } },
  });
  const toSource = await sourceResolver(groups);

  return items.map((item) => {
    const mine = groups.filter(({ entityId }) => entityId === item.id);
    const created = mine.find(({ kind }) => kind === "CREATE");
    const byKey = new Map<string, EntitySource>();
    for (const source of mine.map(toSource)) {
      const key = sourceKey(source);
      if (!byKey.has(key)) byKey.set(key, source);
    }
    return {
      ...item,
      sources: [...byKey.values()],
      creator: created ? toSource(created) : null,
    };
  });
}

/** Loads the names that the groups need, once each. */
async function sourceResolver(groups: ObservationGroup[]) {
  const ids = (key: "integrationId" | "actorUserId") => [
    ...new Set(groups.flatMap((group) => group[key] ?? [])),
  ];
  const [integrations, users] = await Promise.all([
    prisma.integration.findMany({
      where: { id: { in: ids("integrationId") } },
      select: { id: true, name: true, platform: true },
    }),
    prisma.user.findMany({
      where: { id: { in: ids("actorUserId") } },
      select: { id: true, name: true },
    }),
  ]);
  const integrationById = new Map(integrations.map((row) => [row.id, row]));
  const userById = new Map(users.map((row) => [row.id, row]));

  return (group: ObservationGroup): EntitySource => {
    const { source, integrationId, integrationName, actorUserId } = group;
    switch (source) {
      case "INTEGRATION": {
        const live = integrationById.get(integrationId ?? "");
        return {
          source,
          integrationId: live?.id ?? null,
          // A CHECK constraint sets the name on every integration observation.
          name: live?.name ?? integrationName ?? "",
          platform: live?.platform ?? null,
        };
      }
      case "MANUAL":
      case "API_CLIENT":
        return { source, actor: userById.get(actorUserId ?? "") ?? null };
      case "AUTOMATION":
      case "EMAIL":
        return { source };
    }
  };
}

function sourceKey(source: EntitySource): string {
  switch (source.source) {
    case "INTEGRATION":
      return `INTEGRATION:${source.integrationId ?? source.name}`;
    case "MANUAL":
    case "API_CLIENT":
      return `${source.source}:${source.actor?.id}`;
    default:
      return source.source;
  }
}
