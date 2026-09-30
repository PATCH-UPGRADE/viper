// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuthType } from "@/generated/prisma";
import type { AuthCredential } from "../../../../core/credentials";
import { fetchSameOrigin, MAX_BODY_CHARS } from "../fetch-tool";

const INTEGRATION_URI = "https://vendor.example.com/api/v1/assets?page=1";
const NONE: AuthCredential = { authType: AuthType.None };

const fetchMock = vi.fn();

const respond = (
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
) =>
  new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });

const fetchAs = (url: string, creds: AuthCredential = NONE) =>
  fetchSameOrigin(url, { integrationUri: INTEGRATION_URI, creds });

const requestedUrl = (call = 0) => String(fetchMock.mock.calls[call][0]);
const requestedHeaders = (call = 0) =>
  fetchMock.mock.calls[call][1].headers as Record<string, string>;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSameOrigin", () => {
  it("fetches a URL on the integration origin and returns status, type, and body", async () => {
    fetchMock.mockResolvedValue(respond('{"items":[]}'));

    const result = await fetchAs(
      "https://vendor.example.com/api/v1/assets?page=2",
    );

    expect(requestedUrl()).toBe(
      "https://vendor.example.com/api/v1/assets?page=2",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      redirect: "manual",
    });
    expect(result).toContain("HTTP 200");
    expect(result).toContain("Content-Type: application/json");
    expect(result).toContain('{"items":[]}');
  });

  it("resolves a path against the integration URL", async () => {
    fetchMock.mockResolvedValue(respond("{}"));

    await fetchAs("/api/v1/assets/42");

    expect(requestedUrl()).toBe("https://vendor.example.com/api/v1/assets/42");
  });

  it.each([
    ["another host", "https://attacker.example.net/collect"],
    ["another scheme", "http://vendor.example.com/api/v1/assets"],
    ["another port", "https://vendor.example.com:8443/api/v1/assets"],
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
  ])("refuses %s without a request", async (_, url) => {
    const result = await fetchAs(url);

    expect(result).toMatch(/^Refused:/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows a redirect on the same origin", async () => {
    fetchMock
      .mockResolvedValueOnce(
        respond("", { status: 302, headers: { location: "/api/v2/assets" } }),
      )
      .mockResolvedValueOnce(respond('{"moved":true}'));

    const result = await fetchAs(INTEGRATION_URI);

    expect(requestedUrl(1)).toBe("https://vendor.example.com/api/v2/assets");
    expect(result).toContain('{"moved":true}');
  });

  it("refuses a redirect to another origin, so the credentials stay home", async () => {
    fetchMock.mockResolvedValueOnce(
      respond("", {
        status: 301,
        headers: { location: "https://attacker.example.net/steal" },
      }),
    );

    const result = await fetchAs(INTEGRATION_URI, {
      authType: AuthType.Bearer,
      authentication: { token: "s3cret" },
    });

    expect(result).toMatch(/^Refused: https:\/\/attacker\.example\.net/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops after too many redirects", async () => {
    fetchMock.mockImplementation(async () =>
      respond("", { status: 302, headers: { location: "/loop" } }),
    );

    const result = await fetchAs(INTEGRATION_URI);

    expect(result).toMatch(/^Error: more than \d+ redirects/);
  });

  it.each<[string, AuthCredential, Record<string, string>]>([
    [
      "bearer",
      { authType: AuthType.Bearer, authentication: { token: "tok" } },
      { Authorization: "Bearer tok" },
    ],
    [
      "basic",
      {
        authType: AuthType.Basic,
        authentication: { username: "u", password: "p" },
      },
      { Authorization: `Basic ${Buffer.from("u:p").toString("base64")}` },
    ],
    [
      "header",
      {
        authType: AuthType.Header,
        authentication: { header: "X-Api-Key", value: "k" },
      },
      { "X-Api-Key": "k" },
    ],
  ])("sends %s credentials", async (_, creds, expected) => {
    fetchMock.mockResolvedValue(respond("{}"));

    await fetchAs(INTEGRATION_URI, creds);

    expect(requestedHeaders()).toMatchObject(expected);
  });

  it("sends no auth header for None", async () => {
    fetchMock.mockResolvedValue(respond("{}"));

    await fetchAs(INTEGRATION_URI);

    expect(Object.keys(requestedHeaders())).toEqual(["Accept"]);
  });

  it("truncates a long body and says so", async () => {
    fetchMock.mockResolvedValue(respond("x".repeat(MAX_BODY_CHARS + 500)));

    const result = await fetchAs(INTEGRATION_URI);

    expect(result).toContain(`[Truncated after ${MAX_BODY_CHARS} characters.`);
    expect(result.length).toBeLessThan(MAX_BODY_CHARS + 500);
  });

  it("returns an error status as text, for the model to read", async () => {
    fetchMock.mockResolvedValue(
      respond('{"error":"unauthorized"}', { status: 401 }),
    );

    const result = await fetchAs(INTEGRATION_URI);

    expect(result).toContain("HTTP 401");
    expect(result).toContain("unauthorized");
  });

  it("returns a network failure as text", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await fetchAs(INTEGRATION_URI);

    expect(result).toMatch(/^Error: the request to .* failed: ECONNREFUSED/);
  });
});
