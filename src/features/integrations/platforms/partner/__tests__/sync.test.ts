// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

import { AuthType, ResourceType } from "@/generated/prisma";
import type { SyncCtx } from "../../../core/types";
import type { PartnerConfig, PartnerCreds } from "../config";
import { partnerSync } from "../sync";

/**
 * The request body is a contract with every partner we've onboarded (Blueflow
 * today), so it is snapshotted rather than described.
 */

const CALLBACK_URL =
  "http://localhost:3000/api/v1/assets/integrationUpload/tok-123";

const makeCtx = (
  overrides: Partial<SyncCtx<PartnerConfig, PartnerCreds>> = {},
): SyncCtx<PartnerConfig, PartnerCreds> => ({
  integrationId: "int-1",
  config: {
    integrationUri: "http://blueflow:8000/api/viper/webhook/",
    resource: ResourceType.Asset,
  },
  creds: { authType: AuthType.None },
  resource: ResourceType.Asset,
  cursor: null,
  lastSuccessfulSync: null,
  callback: async () => ({
    baseApiUrl: "http://localhost:3000/api/v1",
    path: "/assets/integrationUpload/tok-123",
    url: CALLBACK_URL,
    schema: {},
  }),
  ...overrides,
});

const fetchMock = vi.fn();
const lastBody = () => fetchMock.mock.calls[0][1].body as string;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    statusText: "Accepted",
    json: async () => ({ request_id: "req-1" }),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("partnerSync", () => {
  it("posts the exact registration body a partner expects", async () => {
    await partnerSync(
      makeCtx({ lastSuccessfulSync: new Date("2026-08-11T00:00:00.000Z") }),
    );

    expect(lastBody()).toMatchInlineSnapshot(
      `"{"since":"2026-08-11T00:00:00.000Z","max_pages":1,"page_size":500,"callback":"http://localhost:3000/api/v1/assets/integrationUpload/tok-123"}"`,
    );
  });

  it("asks for exactly one page, because the callback token is single-use", async () => {
    // Page 2 would arrive with a spent token and 401. Lifting this needs a
    // multi-use or per-page token.
    await partnerSync(makeCtx());

    expect(JSON.parse(lastBody()).max_pages).toBe(1);
  });

  it("asks for everything when it has never synced", async () => {
    await partnerSync(makeCtx());

    expect(JSON.parse(lastBody()).since).toBe(new Date(0).toISOString());
  });

  it("sends no auth header when the partner needs none", async () => {
    await partnerSync(makeCtx());

    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("authenticates when the integration carries credentials", async () => {
    await partnerSync(
      makeCtx({
        creds: { authType: AuthType.Bearer, authentication: { token: "abc" } },
      }),
    );

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer abc",
    });
  });

  it("posts to the integration's own URI, path and all", async () => {
    await partnerSync(makeCtx());

    // Routing this through Session.request would resolve the path against a
    // base URL and drop `/api/viper/webhook/`.
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://blueflow:8000/api/viper/webhook/",
    );
  });

  it("stays Pending until the partner pushes", async () => {
    const outcome = await partnerSync(makeCtx());

    expect(outcome).toEqual({ cursor: null, pending: true });
  });

  it("fails the attempt when the partner rejects registration", async () => {
    fetchMock.mockResolvedValue({ ok: false, statusText: "Forbidden" });

    await expect(partnerSync(makeCtx())).rejects.toThrow(
      "Failed to sync data: Forbidden",
    );
  });
});
