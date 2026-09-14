import type { MedIsaoCallCtx } from "../context";

/** One comment as it exists on MedISAO. */
export interface ExternalComment {
  externalId: string;
  pseudonym: string;
  body: string;
  createdAt: string;
}

export interface ExternalCommentPage {
  items: ExternalComment[];
  nextCursor: string | null;
}

/**
 * Reading and writing the comments MedISAO keeps against one remediation.
 *
 */
export interface CommentsApi {
  list(
    ctx: MedIsaoCallCtx,
    externalId: string,
    cursor?: string | null,
  ): Promise<ExternalCommentPage>;

  create(
    ctx: MedIsaoCallCtx,
    externalId: string,
    draft: {
      body: string;
      authorExternalUserId: string;
    },
  ): Promise<ExternalComment>;
}

/** One inquiry we raised with a manufacturer, and their answer if it has come. */
export interface ExternalInquiry {
  externalId: string;
  body: string;
  status: string | null;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export interface ExternalInquiryPage {
  items: ExternalInquiry[];
  nextCursor: string | null;
}

/**
 * Questions we put to a manufacturer about one remediation.
 *
 * The mirror image of `CommentsApi`, and deliberately not merged with it. A
 * comment is pseudonymous and shared with every consumer; an inquiry is
 * attributed and private, scoped to the token that raised it, because a
 * question needs an answer and an answer needs somebody to answer.
 */
export interface InquiriesApi {
  list(
    ctx: MedIsaoCallCtx,
    externalId: string,
    /** Bounded the same way a comments cursor is. */
    cursor?: string | null,
  ): Promise<ExternalInquiryPage>;

  create(
    ctx: MedIsaoCallCtx,
    externalId: string,
    draft: { body: string },
  ): Promise<ExternalInquiry>;
}
