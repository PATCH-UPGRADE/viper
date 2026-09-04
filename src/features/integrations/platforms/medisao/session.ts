import { authHeaders } from "@/features/integrations/core/credentials";
import type { Session } from "../../core/types";
import type { MedIsaoCreds } from "./config";

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * MedISAO needs no login exchange — the API key goes on every request — so this
 * is a header-and-timeout wrapper.
 */
export const createMedIsaoSession = (creds: MedIsaoCreds): Session => ({
  async request(url: string, init?: RequestInit): Promise<Response> {
    return fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...authHeaders(creds),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  },
});
