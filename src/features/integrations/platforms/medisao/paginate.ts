import type { z } from "zod";
import type { Session } from "../../core/types";

/**
 * MedISAO pages with Django REST Framework's envelope: `next` is a whole URL,
 * or null at the end of the stream.
 */
const envelopeSchema = {
  parse: (value: unknown): { next: string | null; results: unknown[] } => {
    const body = value as { next?: unknown; results?: unknown };
    if (!Array.isArray(body?.results)) {
      throw new Error("MedISAO response has no `results` array.");
    }
    const next = body.next;
    if (next !== null && next !== undefined && typeof next !== "string") {
      throw new Error("MedISAO response has a non-string `next`.");
    }
    return { next: next ?? null, results: body.results };
  },
};

// A `next` that points back at a page already walked would spin this loop for
// the life of the job. The cap turns that into a failed sync attempt instead.
const MAX_PAGES = 1000;

/** Carries the status so a caller can tell a vanished channel from a real fault. */
export class MedIsaoRequestError extends Error {
  readonly status: number;

  constructor(url: string, status: number, statusText: string) {
    super(`MedISAO GET ${url} failed: ${status} ${statusText}`);
    this.name = "MedIsaoRequestError";
    this.status = status;
  }
}

/**
 * Refuse to call anything but the configured MedISAO origin.
 *
 * The session puts the API key on every request it makes, so calling a url from
 * anywhere else hands the key to whoever supplied it. Two callers supply one:
 * a `next` link inside a response body, and a cursor a client hands us. Neither
 * is trusted, so both come through here.
 */
const requireSameOrigin = (candidate: string, origin: string): void => {
  let candidateOrigin: string | null = null;
  try {
    candidateOrigin = new URL(candidate).origin;
  } catch {
    candidateOrigin = null;
  }
  if (candidateOrigin !== origin) {
    throw new Error(
      `MedISAO paging tried to leave ${origin}. Refusing to follow ${candidate}.`,
    );
  }
};

/**
 * One page, parsed. `next` is the whole URL of the page after it, or null.
 *
 * Separate from `walkPages` because a caller serving a person wants one page
 * and a cursor to come back with, not the whole collection drained.
 *
 * `allowedOrigin` is required rather than optional so a caller passing a url it
 * did not build itself cannot forget to bound it.
 */
export async function fetchPage<T>(
  session: Session,
  url: string,
  itemSchema: z.ZodType<T>,
  allowedOrigin: string,
): Promise<{ items: T[]; next: string | null }> {
  requireSameOrigin(url, allowedOrigin);

  const response = await session.request(url);
  if (!response.ok) {
    throw new MedIsaoRequestError(url, response.status, response.statusText);
  }

  const { next, results } = envelopeSchema.parse(await response.json());
  return { items: results.map((item) => itemSchema.parse(item)), next };
}

/** Walk every page from `firstUrl`, parsing each item with `itemSchema`. */
export async function* walkPages<T>(
  session: Session,
  firstUrl: string,
  itemSchema: z.ZodType<T>,
): AsyncGenerator<T[]> {
  const origin = new URL(firstUrl).origin;
  let url: string | null = firstUrl;

  for (let page = 0; url !== null; page++) {
    if (page >= MAX_PAGES) {
      throw new Error(
        `MedISAO paging exceeded ${MAX_PAGES} pages starting at ${firstUrl}.`,
      );
    }

    const result: { items: T[]; next: string | null } = await fetchPage(
      session,
      url,
      itemSchema,
      origin,
    );
    yield result.items;
    // An off-origin `next` is refused by the fetch above, before it is called.
    url = result.next;
  }
}

/** `since` is inclusive on their side, so a re-read of the boundary row is normal. */
export const withSince = (url: string, since: Date | null): string => {
  if (!since) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("since", since.toISOString());
  return parsed.toString();
};
