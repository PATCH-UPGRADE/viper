import "server-only";
import { z } from "zod";
import type {
  CommentsApi,
  ExternalComment,
  PlatformCallCtx,
} from "../../../core/types";
import type { MedIsaoConfig, MedIsaoCreds } from "../config";
import { fetchPage, MedIsaoRequestError } from "../paginate";
import { createMedIsaoSession } from "../session";
import { remediationCommentsUrl } from "../urls";

/** MedISAO caps a comment body at 10 000 characters and rejects a blank one. */
const MAX_BODY_LENGTH = 10_000;

const rawCommentSchema = z.object({
  id: z.string(),
  pseudonym: z.string(),
  body: z.string(),
  created_at: z.string(),
});
type RawComment = z.infer<typeof rawCommentSchema>;

const toCanonical = (raw: RawComment): ExternalComment => ({
  externalId: raw.id,
  pseudonym: raw.pseudonym,
  body: raw.body,
  createdAt: raw.created_at,
});

/**
 * Comments other hospitals left on one manufacturer remediation.
 *
 * Two properties of MedISAO's design shape this:
 *
 * - The feed is shared. A read returns every consumer's comments, not ours, so
 *   nothing here filters by author.
 * - Authors are pseudonymous. `pseudonym` is stable within one remediation and
 *   uncorrelated across remediations, so it is a display handle and never an
 *   identity.
 *
 * Comments are append-only: MedISAO exposes no edit or delete, partly because
 * an edit history is itself correlatable.
 */
export const comments: CommentsApi<MedIsaoConfig, MedIsaoCreds> = {
  async list(
    ctx: PlatformCallCtx<MedIsaoConfig, MedIsaoCreds>,
    externalId: string,
    cursor?: string | null,
  ) {
    const session = createMedIsaoSession(ctx.creds);
    // `next` comes back as a whole URL, so a cursor is followed as given.
    const url = cursor ?? remediationCommentsUrl(ctx.config.apiUrl, externalId);

    try {
      // `url` may be a cursor the client sent, so it is bounded to the
      // configured origin before the session signs a request with it.
      const { items, next } = await fetchPage(
        session,
        url,
        rawCommentSchema,
        new URL(ctx.config.apiUrl).origin,
      );
      return { items: items.map(toCanonical), nextCursor: next };
    } catch (error) {
      // Comments inherit the remediation's visibility exactly. A manufacturer
      // unpublishing it, or opting the device out, reads as a 404 and is not a
      // fault: there is simply nothing to show any more.
      if (error instanceof MedIsaoRequestError && error.status === 404) {
        return { items: [], nextCursor: null };
      }
      throw error;
    }
  },

  async create(
    ctx: PlatformCallCtx<MedIsaoConfig, MedIsaoCreds>,
    externalId: string,
    draft: { body: string; authorExternalUserId: string },
  ) {
    const body = draft.body.trim();
    if (!body) throw new Error("A comment cannot be blank.");
    if (body.length > MAX_BODY_LENGTH) {
      throw new Error(
        `A comment cannot exceed ${MAX_BODY_LENGTH} characters, got ${body.length}.`,
      );
    }

    const session = createMedIsaoSession(ctx.creds);
    const url = remediationCommentsUrl(ctx.config.apiUrl, externalId);

    const response = await session.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // The only value a channel token may assert. "medisao_native" means
        // Medcrypt authenticated the person themselves, which we cannot claim.
        author_provider: "viper",
        author_external_user_id: draft.authorExternalUserId,
        body,
      }),
    });

    if (!response.ok) {
      throw new MedIsaoRequestError(url, response.status, response.statusText);
    }

    // The 201 carries exactly what every other reader sees, including the
    // pseudonym and never the identity we just asserted.
    return toCanonical(rawCommentSchema.parse(await response.json()));
  },
};
