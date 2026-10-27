// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServiceNowSession } from "../session";

const session = () =>
  createServiceNowSession({
    integrationId: "int-sn",
    config: { instanceUrl: "https://example.service-now.com" },
    creds: { username: "viper.integration", password: "secret" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createServiceNowSession", () => {
  it("resolves a path against the instance and sends basic auth", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await session().request("/api/now/table/change_request?sysparm_limit=1");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.toString()).toBe(
      "https://example.service-now.com/api/now/table/change_request?sysparm_limit=1",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("viper.integration:secret").toString("base64")}`,
    );
  });

  it("refuses to send the credentials to another origin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      session().request("https://attacker.example/api/now/table/x"),
    ).rejects.toThrow(/Refusing/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
