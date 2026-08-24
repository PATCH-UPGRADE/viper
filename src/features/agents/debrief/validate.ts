import "server-only";
import {
  DEBRIEF_PLACEHOLDER,
  type DebriefBullet,
  type DebriefBulletDraft,
  type DebriefLink,
  type DebriefLinkEntity,
} from "@/features/debrief/types";
import prisma from "@/lib/db";

/**
 * Where each link entity type is looked up, so a link the model invented can be
 * dropped before it reaches the card. Mirrors the id filtering in
 * `inbox/agent/mitigation/persist.ts`.
 *
 * Written out per entity rather than driven from a name table: the table form
 * needs a cast to unify Prisma's per-model `findMany` signatures, and an
 * unchecked cast in the path that decides what is real is a poor trade for
 * twenty lines.
 */
const ID_LOOKUP: Record<
  DebriefLinkEntity,
  (ids: string[]) => Promise<{ id: string }[]>
> = {
  notification: (ids) =>
    prisma.notification.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }),
  vulnerability: (ids) =>
    prisma.vulnerability.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }),
  asset: (ids) =>
    prisma.asset.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }),
  remediation: (ids) =>
    prisma.remediation.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }),
  issue: (ids) =>
    prisma.issue.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }),
  workOrder: (ids) =>
    prisma.workOrderTicket.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }),
};

/** Key for the existence set. Entity ids are cuids, so ":" cannot collide. */
const idKey = (link: DebriefLink) => `${link.entityType}:${link.entityId}`;

/**
 * Every link that resolves to a real row, as one flat set of "type:id" keys.
 *
 * One query per entity type the draft mentions, with that type's ids unioned —
 * never one query per link.
 */
async function resolveExistingIds(
  bullets: DebriefBulletDraft[],
): Promise<Set<string>> {
  const wanted = new Map<DebriefLinkEntity, Set<string>>();
  for (const bullet of bullets) {
    for (const link of bullet.links) {
      const set = wanted.get(link.entityType) ?? new Set<string>();
      set.add(link.entityId);
      wanted.set(link.entityType, set);
    }
  }

  const found = await Promise.all(
    [...wanted.entries()].map(async ([entityType, ids]) => {
      const rows = await ID_LOOKUP[entityType]([...ids]);
      return rows.map((row) => `${entityType}:${row.id}`);
    }),
  );

  return new Set(found.flat());
}

/**
 * Rewrite one bullet so its text and its links agree.
 *
 * A link survives only if BOTH its id resolves and the text points at it. That
 * single rule is decided once, before any rewriting: renumbering against one
 * set of survivors and then filtering the array against another is how the two
 * drift apart and leave a placeholder pointing past the end of the array.
 *
 * Survivors are renumbered in order, so dropping `{{1}}` turns the old `{{2}}`
 * into `{{1}}`. A placeholder whose link did not survive is replaced by the
 * label the model wrote, so the sentence still reads correctly — the fact
 * survives even when the link does not.
 */
function rewrite(
  bullet: DebriefBulletDraft,
  keep: (link: DebriefLink) => boolean,
): DebriefBullet {
  // Read from the ORIGINAL text, before any substitution.
  const referenced = new Set(
    [...bullet.text.matchAll(DEBRIEF_PLACEHOLDER)].map((m) => Number(m[1])),
  );

  const survivors: DebriefLink[] = [];
  const newIndexByOld = new Map<number, number>();

  bullet.links.forEach((link, oldIndex) => {
    // Call keep() for every link, so the caller still counts each one whose id
    // did not resolve — including links the text never pointed at.
    const idResolves = keep(link);
    if (idResolves && referenced.has(oldIndex)) {
      newIndexByOld.set(oldIndex, survivors.length);
      survivors.push(link);
    }
  });

  const text = bullet.text.replace(
    DEBRIEF_PLACEHOLDER,
    (_match, digits: string) => {
      const oldIndex = Number(digits);
      const newIndex = newIndexByOld.get(oldIndex);
      if (newIndex !== undefined) return `{{${newIndex}}}`;
      // Orphaned marker: inline the label the model wrote, or drop it when the
      // index pointed at no link at all.
      return bullet.links[oldIndex]?.label ?? "";
    },
  );

  return {
    text: text.replace(/\s{2,}/g, " ").trim(),
    links: survivors,
  };
}

export type ValidateResult = {
  /**
   * Repaired bullets, ready to store. MAY BE EMPTY: every bullet's text can
   * collapse when the model emits nothing but placeholders and every id it
   * invented is dropped.
   *
   * An empty list does not satisfy `debriefBulletsSchema`, which requires at
   * least one. That is deliberate — the caller decides what an empty survey
   * means (mark the run Failed, or leave yesterday's debrief in place). This
   * function repairs a draft; it does not invent a bullet to fill the gap,
   * because a fabricated bullet is indistinguishable from one the agent wrote.
   */
  bullets: DebriefBullet[];
  /** Links dropped because their entity id did not resolve to a real row. */
  droppedLinks: number;
};

/** How many bullets a debrief may hold. Mirrors `debriefBulletsSchema`. */
const MAX_BULLETS = 5;

/**
 * Turn a writer draft into bullets safe to store: drop links whose ids do not
 * exist, renumber the placeholders left behind, and clamp to five bullets.
 *
 * Never throws. A model that invents every id yields bullets with no links
 * rather than a failed run
 */
export async function validateBullets(
  draft: DebriefBulletDraft[],
): Promise<ValidateResult> {
  const existing = await resolveExistingIds(draft);
  let droppedLinks = 0;

  const bullets = draft
    .map((bullet) =>
      rewrite(bullet, (link) => {
        const ok = existing.has(idKey(link));
        if (!ok) droppedLinks += 1;
        return ok;
      }),
    )
    // A bullet whose text collapsed to nothing has no content left to show.
    .filter((bullet) => bullet.text.length > 0)
    .slice(0, MAX_BULLETS);

  if (droppedLinks > 0) {
    console.warn(
      `[debrief] dropped ${droppedLinks} link(s) whose entity id does not exist`,
    );
  }

  return { bullets, droppedLinks };
}
