import "server-only";
import prisma from "@/lib/db";
import { EntityFilterError, resolveEntityFilter } from "@/lib/entity-filter";
import { inngest } from "../client";

// Materializes EntityFilter -> EntityFilterMatch rows. Two entry points:
//   - resolveAllEntityFilters: hourly cron job
//   - resolveEntityFilterFn: resolves a single filter. Also dispatched directly
//     via requestEntityFilterResolve on filter create/update for immediacy.

const RESOLVE_EVENT = "entity-filter/resolve.requested" as const;

/** Ask the resolver to (re)materialize matches for one filter. */
export async function requestEntityFilterResolve(
  entityFilterId: string,
): Promise<void> {
  await inngest.send({ name: RESOLVE_EVENT, data: { entityFilterId } });
}

export const resolveAllEntityFilters = inngest.createFunction(
  { id: "resolve-all-entity-filters" },
  { cron: "0 * * * *" }, // hourly cron job
  async ({ step }) => {
    const filters = await step.run("fetch-entity-filters", () =>
      prisma.entityFilter.findMany({ select: { id: true } }),
    );

    if (filters.length === 0) return { count: 0 };

    await step.sendEvent(
      "trigger-entity-filter-resolves",
      filters.map((filter) => ({
        name: RESOLVE_EVENT,
        data: { entityFilterId: filter.id },
      })),
    );

    return { count: filters.length };
  },
);

export const resolveEntityFilterFn = inngest.createFunction(
  { id: "resolve-entity-filter" },
  { event: RESOLVE_EVENT },
  async ({ event, step, logger }) => {
    const { entityFilterId } = event.data as { entityFilterId: string };

    const filter = await step.run("fetch-filter", () =>
      prisma.entityFilter.findUnique({
        where: { id: entityFilterId },
        select: { id: true, targetModel: true, filter: true },
      }),
    );

    if (!filter) return { skipped: true, reason: "filter not found" };

    // Resolve inside a step so a bad filter is a returned result, not a thrown
    // error that triggers Inngest retries.
    const resolved = await step.run("resolve-filter", async () => {
      try {
        const ids = await resolveEntityFilter(
          filter.targetModel,
          filter.filter,
        );
        return { ok: true as const, ids };
      } catch (err) {
        if (err instanceof EntityFilterError) {
          return { ok: false as const, reason: err.message };
        }
        throw err;
      }
    });

    if (!resolved.ok) {
      logger.warn(
        `Skipping entity filter ${entityFilterId}: ${resolved.reason}`,
      );
      // Leave existing matches and lastResolvedAt untouched.
      return { skipped: true, reason: resolved.reason };
    }

    const targetIds = resolved.ids;

    const created = await step.run("sync-matches", async () =>
      prisma.$transaction(async (tx) => {
        // Drop matches that no longer apply.
        await tx.entityFilterMatch.deleteMany({
          where:
            targetIds.length === 0
              ? { entityFilterId }
              : { entityFilterId, targetId: { notIn: targetIds } },
        });

        // Add newly-matching rows (idempotent via the [entityFilterId,targetId]
        // unique constraint).
        const result =
          targetIds.length === 0
            ? { count: 0 }
            : await tx.entityFilterMatch.createMany({
                data: targetIds.map((targetId) => ({
                  entityFilterId,
                  targetId,
                })),
                skipDuplicates: true,
              });

        await tx.entityFilter.update({
          where: { id: entityFilterId },
          data: { lastResolvedAt: new Date() },
        });

        return result.count;
      }),
    );

    return { entityFilterId, matched: targetIds.length, created };
  },
);
