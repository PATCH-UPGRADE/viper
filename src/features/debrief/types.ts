import { z } from "zod";

/**
 * Entities a debrief bullet can link to. Every member must have a detail page in
 * the app, so the model cannot produce a link that 404s. Add a member only after
 * you add its route to DEBRIEF_LINK_ROUTES below.
 */
export const DEBRIEF_LINK_ENTITIES = [
  "notification",
  "vulnerability",
  "asset",
  "remediation",
  "issue",
  "workOrder",
] as const;

export type DebriefLinkEntity = (typeof DEBRIEF_LINK_ENTITIES)[number];

/** Detail route for each entity. The app builds the href, never the model. */
const DEBRIEF_LINK_ROUTES: Record<DebriefLinkEntity, string> = {
  notification: "/inbox",
  vulnerability: "/vulnerabilities",
  asset: "/assets",
  remediation: "/remediations",
  issue: "/issues",
  workOrder: "/tracking",
};

export const debriefLinkSchema = z.object({
  /** Text the reader sees, for example "Nephrotek Renastar bypass". */
  label: z.string().min(1).max(80),
  entityType: z.enum(DEBRIEF_LINK_ENTITIES),
  /** Id of the record. It must come from retrieved data, never invented. */
  entityId: z.string().min(1),
});

export type DebriefLink = z.infer<typeof debriefLinkSchema>;

export const DEBRIEF_PLACEHOLDER = /\{\{(\d+)\}\}/g;

/**
 * How many sentences a bullet may hold.
 *
 * Sentences, not characters, because this is what the writer is asked for. A
 * model cannot count characters but reliably writes "at most three sentences",
 * and enforcing the same unit means a bullet is shortened by dropping a whole
 * sentence rather than cut mid-clause.
 */
export const DEBRIEF_MAX_BULLET_SENTENCES = 3;

/**
 * Character backstop for a run-on, not the working limit.
 */
export const DEBRIEF_MAX_BULLET_CHARS = 800;

/**
 * Sentence boundary: a terminator followed by whitespace AND a capital.
 *
 * Both conditions are load-bearing in this domain, which is full of dots that
 * are not sentence ends — firmware "M.02.07", products like "syngo.plaza",
 * scores like "CVSS 9.8", and "etc. devices" all stay intact.
 */
export const DEBRIEF_SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z])/;

/**
 * Structural shape only, without the placeholder invariant.
 *
 * This is what the writer agent is asked to emit. `superRefine` cannot be
 * expressed in JSON Schema, so a refinement here would not constrain the model
 * — it would only throw after the fact and lose the whole run. The agent emits
 * a draft, `validate.ts` repairs it, and the repaired result must then satisfy
 * `debriefBulletSchema` below before anything is stored.
 */
export const debriefBulletDraftSchema = z.object({
  text: z.string().min(1),
  links: z.array(debriefLinkSchema).max(3),
});

export type DebriefBulletDraft = z.infer<typeof debriefBulletDraftSchema>;

export const debriefBulletSchema = debriefBulletDraftSchema
  .extend({ text: z.string().min(1).max(DEBRIEF_MAX_BULLET_CHARS) })
  .superRefine((bullet, ctx) => {
    const used = new Set(
      [...bullet.text.matchAll(DEBRIEF_PLACEHOLDER)].map((m) => Number(m[1])),
    );
    for (const index of used) {
      if (index >= bullet.links.length) {
        ctx.addIssue({
          code: "custom",
          message: `text references {{${index}}} but only ${bullet.links.length} link(s) were supplied`,
          path: ["text"],
        });
      }
    }
    bullet.links.forEach((_, index) => {
      if (!used.has(index)) {
        ctx.addIssue({
          code: "custom",
          message: `links[${index}] is never referenced by a {{${index}}} placeholder`,
          path: ["links", index],
        });
      }
    });
  });

export type DebriefBullet = z.infer<typeof debriefBulletSchema>;

export const debriefBulletsSchema = z.array(debriefBulletSchema).min(1).max(5);

export function debriefLinkHref(link: DebriefLink): string {
  return `${DEBRIEF_LINK_ROUTES[link.entityType]}/${encodeURIComponent(link.entityId)}`;
}
