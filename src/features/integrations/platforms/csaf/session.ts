import "server-only";
import type { Session } from "../../core/types";

const TIMEOUT_MS = 30_000;
export const MAX_FEED_BYTES = 20 * 1024 * 1024;
export const MAX_DOC_BYTES = 5 * 1024 * 1024;

export const createCsafSession = (): Session => ({
  request: async (url, init) => {
    if (!url.startsWith("https://")) {
      throw new Error(`CSAF requires https: ${url}`);
    }
    return fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json", ...init?.headers },
    });
  },
});

export const readCapped = async (
  response: Response,
  limit: number,
  label: string,
): Promise<Buffer> => {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new Error(`${label}: declares ${declared} bytes`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${label}: response had no body`);

  if (!response.body) throw new Error(`${label}: response had no body`);

  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`${label}` + `:exceeded ${limit} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
};
