import "server-only";
import { z } from "zod";
import type {
  ExternalInquiry,
  InquiriesApi,
  PlatformCallCtx,
} from "../../../core/types";
import type { MedIsaoConfig, MedIsaoCreds } from "../config";
import { fetchPage, MedIsaoRequestError } from "../paginate";
import { createMedIsaoSession } from "../session";
import { remediationInquiriesUrl } from "../urls";

/** MedISAO caps an inquiry body at 10 000 characters. */
const MAX_BODY_LENGTH = 10_000;

const rawInquirySchema = z.object({
  id: z.string(),
  body: z.string(),
  status: z.string().nullish(),
  response: z.string().nullish(),
  responded_at: z.string().nullish(),
  created_at: z.string(),
});
type RawInquiry = z.infer<typeof rawInquirySchema>;

const toCanonical = (raw: RawInquiry): ExternalInquiry => ({
  externalId: raw.id,
  body: raw.body,
  status: raw.status ?? null,
  response: raw.response ?? null,
  respondedAt: raw.responded_at ?? null,
  createdAt: raw.created_at,
});

/**
 * Questions this hospital put to the manufacturer about one remediation.
 *
 * Unlike comments, the feed is private: MedISAO scopes inquiries to the token
 * that raised them, so a read returns only our own and no filtering is needed
 * here. There is no author field either — the token says who is asking, which
 * is the point, because an answer has to come back to somebody.
 */
export const inquiries: InquiriesApi<MedIsaoConfig, MedIsaoCreds> = {
  async list(
    ctx: PlatformCallCtx<MedIsaoConfig, MedIsaoCreds>,
    externalId: string,
    cursor?: string | null,
  ) {
    const session = createMedIsaoSession(ctx.creds);
    const url =
      cursor ?? remediationInquiriesUrl(ctx.config.apiUrl, externalId);

    try {
      // `url` may be a cursor the client sent, so it is bounded to the
      // configured origin before the session signs a request with it.
      const { items, next } = await fetchPage(
        session,
        url,
        rawInquirySchema,
        new URL(ctx.config.apiUrl).origin,
      );
      return { items: items.map(toCanonical), nextCursor: next };
    } catch (error) {
      // Inquiries inherit the remediation's visibility, so an unpublished
      // record reads as nothing to show rather than a fault.
      if (error instanceof MedIsaoRequestError && error.status === 404) {
        return { items: [], nextCursor: null };
      }
      throw error;
    }
  },

  async create(
    ctx: PlatformCallCtx<MedIsaoConfig, MedIsaoCreds>,
    externalId: string,
    draft: { body: string },
  ) {
    const body = draft.body.trim();
    if (!body) throw new Error("An inquiry cannot be blank.");
    if (body.length > MAX_BODY_LENGTH) {
      throw new Error(
        `An inquiry cannot exceed ${MAX_BODY_LENGTH} characters, got ${body.length}.`,
      );
    }

    const session = createMedIsaoSession(ctx.creds);
    const url = remediationInquiriesUrl(ctx.config.apiUrl, externalId);

    const response = await session.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The body is the whole payload. Everything else on an inquiry — status,
      // the answer, when it came — is the manufacturer's to write.
      body: JSON.stringify({ body }),
    });

    if (!response.ok) {
      throw new MedIsaoRequestError(url, response.status, response.statusText);
    }

    return toCanonical(rawInquirySchema.parse(await response.json()));
  },
};
