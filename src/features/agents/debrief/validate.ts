import "server-only";
import {
  DEBRIEF_MAX_BULLET_CHARS,
  DEBRIEF_MAX_BULLET_LINKS,
  DEBRIEF_MAX_BULLET_SENTENCES,
  DEBRIEF_PLACEHOLDER,
  type DebriefBullet,
  type DebriefBulletDraft,
  type DebriefLink,
  type DebriefLinkEntity,
  debriefBulletSchema,
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
 * Sentence boundary: a terminator, then whitespace, then a sentence opener.
 *
 * Every part is load-bearing in this domain, which is full of dots that are not
 * sentence ends — firmware "M.02.07", products like "syngo.plaza", and scores
 * like "CVSS 9.8" all stay intact because none is followed by whitespace, and
 * "etc. devices" stays intact because a lowercase word is not an opener.
 *
 * The opener class includes digits and `{` because a bullet often starts with a
 * device count ("11 monitors...") or a link marker ("{{0}} is already...").
 */
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z0-9{])/;

/**
 * Enforce the readability rule: at most DEBRIEF_MAX_BULLET_SENTENCES sentences.
 *
 * Drops whole sentences, so every surviving one stays grammatical. Joining with
 * a single space also normalises any newline the writer put between sentences.
 */
function dropExtraSentences(text: string): string {
  const sentences = text.split(SENTENCE_BOUNDARY);
  if (sentences.length <= DEBRIEF_MAX_BULLET_SENTENCES) return text;
  return sentences.slice(0, DEBRIEF_MAX_BULLET_SENTENCES).join(" ");
}

/**
 * Enforce the storage contract: never exceed DEBRIEF_MAX_BULLET_CHARS.
 *
 * A different rule from the sentence limit, with a different failure mode — an
 * over-long bullet fails `debriefBulletSchema`, and one bad bullet blanks the
 * whole card. Only reachable when a single sentence runs past the backstop,
 * i.e. the writer ignored the sentence instruction. The text is malformed
 * already, so an ellipsis is the honest result.
 */
function clampToChars(text: string): string {
  if (text.length <= DEBRIEF_MAX_BULLET_CHARS) return text;

  const head = text.slice(0, DEBRIEF_MAX_BULLET_CHARS - 1);
  const word = head.lastIndexOf(" ");
  const cut = word > 0 ? head.slice(0, word) : head;
  // A cut can land inside a marker and leave "{{1" behind, which would render
  // as literal text.
  const partialMarker = /\{\{?\d*$/;
  return `${cut.replace(partialMarker, "").trimEnd()}\u2026`;
}

/**
 * Rewrite one bullet so its text and its links agree.
 *
 * Three passes, in this order, and the order is the whole design:
 *
 * 1. Inline. A marker whose link did not resolve is replaced by the label the
 *    writer wrote, so the fact survives even when the link does not. This runs
 *    FIRST because a label is longer than a marker, and the length rules below
 *    must measure the text that will actually be stored.
 * 2. Shorten. Sentence rule, then the storage backstop.
 * 3. Renumber. Only markers that survived the shortening keep a link, and they
 *    are renumbered in order, so a new index is never wider than the old one
 *    and the clamped length still holds.
 *
 * After pass 1, a `{{n}}` can only remain where the link resolved — every other
 * marker, including an out-of-range one, was already replaced. So the surviving
 * markers ARE the surviving links, and no second predicate is needed.
 */
function rewrite(
  bullet: DebriefBulletDraft,
  resolves: (link: DebriefLink) => boolean,
): DebriefBullet {
  // A link past the cap is treated exactly like one whose id does not exist:
  // its marker inlines as a label, so the sentence still reads correctly.
  const idResolves = bullet.links.map(
    (link, index) => index < DEBRIEF_MAX_BULLET_LINKS && resolves(link),
  );

  const inlined = bullet.text.replace(
    DEBRIEF_PLACEHOLDER,
    (marker, digits: string) => {
      if (idResolves[Number(digits)]) return marker;
      // Strip marker syntax out of the label before inlining it. A label
      // containing "{{9}}" would otherwise inject a marker pointing at a link
      // that does not exist, and the whole bullet gets dropped at the storage
      // gate below — losing a fact over a stray brace.
      const label = bullet.links[Number(digits)]?.label ?? "";
      return label.replace(DEBRIEF_PLACEHOLDER, "");
    },
  );

  const shortened = clampToChars(dropExtraSentences(inlined));

  // Read in order, so renumbering is ascending by construction.
  const kept = [
    ...new Set(
      [...shortened.matchAll(DEBRIEF_PLACEHOLDER)].map((m) => Number(m[1])),
    ),
  ].sort((a, b) => a - b);

  const text = shortened.replace(
    DEBRIEF_PLACEHOLDER,
    (_marker, digits: string) => `{{${kept.indexOf(Number(digits))}}}`,
  );

  return {
    text: text.replace(/\s{2,}/g, " ").trim(),
    links: kept.map((oldIndex) => bullet.links[oldIndex]),
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
  const resolves = (link: DebriefLink) => existing.has(idKey(link));

  // Counted over the draft, not inside rewrite, so the number does not depend
  // on how many times the rewrite loop happens to consult the predicate.
  const droppedLinks = draft
    .flatMap((bullet) => bullet.links)
    .filter((link) => !resolves(link)).length;

  const bullets = draft
    .map((bullet) => rewrite(bullet, resolves))
    // A bullet whose text collapsed to nothing has no content left to show.
    .filter((bullet) => bullet.text.length > 0)
    .filter((bullet) => debriefBulletSchema.safeParse(bullet).success)
    .slice(0, MAX_BULLETS);

  if (droppedLinks > 0) {
    console.warn(
      `[debrief] dropped ${droppedLinks} link(s) whose entity id does not exist`,
    );
  }

  return { bullets, droppedLinks };
}
