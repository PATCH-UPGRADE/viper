import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  type AuthCredential,
  authHeaders,
} from "@/features/integrations/core/credentials";

export const FETCH_URL_TOOL = "fetch_url";

/** Longer bodies are cut, so one large page cannot fill the context window. */
export const MAX_BODY_CHARS = 40_000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 30_000;

type FetchScope = { integrationUri: string; creds: AuthCredential };

/**
 * GET one URL on the integration's origin. The credentials go on every request,
 * so a URL on any other origin is refused, redirect hops included.
 *
 * Failures come back as text, not as thrown errors, so the model can read the
 * problem and try another URL.
 */
export async function fetchSameOrigin(
  rawUrl: string,
  { integrationUri, creds }: FetchScope,
): Promise<string> {
  const { origin } = new URL(integrationUri);

  let url: URL;
  try {
    url = new URL(rawUrl, integrationUri);
  } catch {
    return `Error: "${rawUrl}" is not a valid URL.`;
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.origin !== origin) {
      return `Refused: ${url.href} is outside ${origin}. Only URLs on the integration's origin can be fetched.`;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json, text/*;q=0.9, */*;q=0.5",
          ...authHeaders(creds),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return `Error: the request to ${url.href} failed: ${reason}`;
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      url = new URL(location, url);
      continue;
    }

    const { text, truncated } = await readCapped(res, MAX_BODY_CHARS);
    return [
      `HTTP ${res.status} ${res.statusText}`,
      `URL: ${url.href}`,
      `Content-Type: ${res.headers.get("content-type") ?? "unknown"}`,
      "",
      text,
      truncated
        ? `\n[Truncated after ${MAX_BODY_CHARS} characters. Request a smaller page if the API supports it.]`
        : "",
    ].join("\n");
  }

  return `Error: more than ${MAX_REDIRECTS} redirects from ${rawUrl}.`;
}

/** Stops reading once past `max`, so a large download is not pulled in whole. */
async function readCapped(
  res: Response,
  max: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (text.length <= max) {
    const { done, value } = await reader.read();
    if (done) return { text: text + decoder.decode(), truncated: false };
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel();
  return { text: text.slice(0, max), truncated: true };
}

export function makeFetchUrlTool(scope: FetchScope) {
  return tool(async ({ url }) => fetchSameOrigin(url, scope), {
    name: FETCH_URL_TOOL,
    description:
      "Send a GET request to one URL on the integration's origin and return the status, content type, and body. Relative URLs resolve against the integration URL. The integration's credentials are added for you.",
    schema: z.object({
      url: z
        .string()
        .describe("An absolute URL on the integration's origin, or a path."),
    }),
  });
}
