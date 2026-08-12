// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

import { AuthType, ResourceType } from "@/generated/prisma";
import { createNoopSession } from "../../../core/session/basic";
import type { SyncCtx } from "../../../core/types";
import type { AiConfig, AiCreds } from "../config";
import { aiSync } from "../sync";

/**
 * The POST body below is a contract with the committed
 * `n8n_workflows/AI_Sync_Workflow.json`, which reads these exact fields. The
 * snapshot exists so a well-meaning refactor of the body can't quietly break a
 * workflow that lives outside this repo.
 */

const CALLBACK = {
  baseApiUrl: "http://localhost:3000/api/v1",
  path: "/vulnerabilities/integrationUpload/tok-123",
  url: "http://localhost:3000/api/v1/vulnerabilities/integrationUpload/tok-123",
  schema: { type: "object" as const },
};

const makeCtx = (
  overrides: Partial<SyncCtx<AiConfig, AiCreds>> = {},
): SyncCtx<AiConfig, AiCreds> => ({
  config: {
    integrationUri: "https://vendor.example.com/advisories",
    resource: ResourceType.Vulnerability,
    additionalInstructions: "Only CVEs from 2026.",
  },
  creds: { authType: AuthType.Bearer, authentication: { token: "s3cret" } },
  resource: ResourceType.Vulnerability,
  // The platform never fetches; the data comes back at the callback.
  session: createNoopSession(),
  cursor: null,
  lastSuccessfulSync: null,
  ingest: async () => {},
  callback: async () => CALLBACK,
  ...overrides,
});

const fetchMock = vi.fn();
const lastBody = () => fetchMock.mock.calls[0][1].body as string;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("N8N_AI_SYNC_URL", "https://n8n.example.com/webhook/ai-sync");
  vi.stubEnv("N8N_KEY", "n8n-key");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    statusText: "OK",
    json: async () => ({ accepted: true }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("aiSync", () => {
  it("posts the exact body the n8n workflow reads", async () => {
    await aiSync(makeCtx());

    expect(lastBody()).toMatchInlineSnapshot(
      `"{"baseApiUrl":"http://localhost:3000/api/v1","responsePath":"/vulnerabilities/integrationUpload/tok-123","responseSchema":{"type":"object"},"resourceType":"Vulnerability","integrationUri":"https://vendor.example.com/advisories","additionalInstructions":"Only CVEs from 2026.","authType":"Bearer","authentication":{"token":"s3cret"}}"`,
    );
  });

  it("forwards the integration's credentials to n8n, on purpose", async () => {
    // Not a leak: n8n crawls the upstream on our behalf and has to authenticate
    // as us. If you are here to "fix" this, read the TODO(VW-427) in sync.ts.
    await aiSync(makeCtx());

    expect(JSON.parse(lastBody())).toMatchObject({
      authType: AuthType.Bearer,
      authentication: { token: "s3cret" },
    });
  });

  it("omits additionalInstructions entirely when unset", async () => {
    await aiSync(
      makeCtx({
        config: {
          integrationUri: "https://vendor.example.com/advisories",
          resource: ResourceType.Vulnerability,
        },
      }),
    );

    expect(lastBody()).not.toContain("additionalInstructions");
  });

  it("authenticates to n8n and targets the configured webhook", async () => {
    await aiSync(makeCtx());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://n8n.example.com/webhook/ai-sync");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "n8n-key" });
  });

  it("stays Pending, because the data arrives at the callback later", async () => {
    const outcome = await aiSync(makeCtx({ cursor: { v: 1 } }));

    expect(outcome).toEqual({ cursor: { v: 1 }, pending: true });
  });

  it("fails loudly when n8n is not configured", async () => {
    vi.stubEnv("N8N_KEY", "");
    await expect(aiSync(makeCtx())).rejects.toThrow(/N8N_KEY/);
  });

  it("fails the attempt when n8n rejects the hand-off", async () => {
    fetchMock.mockResolvedValue({ ok: false, statusText: "Bad Gateway" });

    await expect(aiSync(makeCtx())).rejects.toThrow(
      "Failed to sync data: Bad Gateway",
    );
  });
});
