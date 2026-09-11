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
 * Where the next page may live.
 *
 * `next` arrives inside a response body, and the session puts the API key on
 * every request it makes. Following that link wherever it points would hand the
 * key to whoever wrote it, so a page is only ever followed back to the origin
 * the walk started from.
 */
const sameOrigin = (candidate: string, origin: string): boolean => {
  try {
    return new URL(candidate).origin === origin;
  } catch {
    return false;
  }
};

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

    const response = await session.request(url);
    if (!response.ok) {
      throw new MedIsaoRequestError(url, response.status, response.statusText);
    }

    const { next, results } = envelopeSchema.parse(await response.json());
    yield results.map((item) => itemSchema.parse(item));

    if (next !== null && !sameOrigin(next, origin)) {
      throw new Error(
        `MedISAO paging tried to leave ${origin}. Refusing to follow ${next}.`,
      );
    }
    url = next;
  }
}

/** `since` is inclusive on their side, so a re-read of the boundary row is normal. */
export const withSince = (url: string, since: Date | null): string => {
  if (!since) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("since", since.toISOString());
  return parsed.toString();
};
