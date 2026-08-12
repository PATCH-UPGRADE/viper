import "server-only";
import type { Session } from "../types";

/**
 * A fetch wrapper with a base URL, JSON decoding, a timeout, and retries.
 * Platforms build their `Session` on top of this rather than reimplementing
 * "call an API and don't hang forever" once per connector.
 */

export interface HttpSessionOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  /** Default 30s — the timeout every integration fetch has used to date. */
  timeoutMs?: number;
  /** Default 2. Only 429 / 5xx / network errors are retried. */
  retries?: number;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: string,
  ) {
    super(`${status} ${statusText}${body ? ` — ${body.slice(0, 500)}` : ""}`);
    this.name = "HttpError";
  }
}

const isRetryable = (status: number) => status === 429 || status >= 500;

export const createHttpSession = (opts: HttpSessionOptions): Session => ({
  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = new URL(path, opts.baseUrl).toString();
    const retries = opts.retries ?? 2;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          headers: {
            Accept: "application/json",
            ...opts.headers,
            ...init?.headers,
          },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        });

        if (res.ok) return (await res.json()) as T;

        const error = new HttpError(
          res.status,
          res.statusText,
          await res.text().catch(() => ""),
        );
        if (!isRetryable(res.status) || attempt === retries) throw error;
        lastError = error;
      } catch (error) {
        // A non-retryable HttpError is final; anything else (network, timeout)
        // gets the remaining attempts.
        if (error instanceof HttpError && !isRetryable(error.status))
          throw error;
        if (attempt === retries) throw error;
        lastError = error;
      }

      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }

    throw lastError;
  },
});
