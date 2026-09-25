// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({
  fingerprintOf: () => "fingerprint",
  getCookie: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("../cookie-cache", () => cache);

import { createFleetSession } from "../session";

const INPUT = {
  integrationId: "int-1",
  config: {},
  creds: { username: "svc@example.com", password: "pw" },
};
const OLD = { header: "Cookie", value: "sid=old", expiresAt: null };
const NEW = { header: "Cookie", value: "sid=new", expiresAt: null };

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createFleetSession", () => {
  it("does not sign in before the first request", () => {
    createFleetSession(INPUT);

    expect(cache.getCookie).not.toHaveBeenCalled();
  });

  it("sends the cached cookie", async () => {
    cache.getCookie.mockResolvedValue(OLD);
    fetchMock.mockResolvedValue(new Response("[]"));

    await createFleetSession(INPUT).request("https://fleet.test/a");

    expect(cache.getCookie).toHaveBeenCalledWith(
      "int-1",
      "fingerprint",
      expect.any(Function),
    );
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Cookie: "sid=old",
    });
  });

  it("drops a rejected cookie and retries once with a new one", async () => {
    cache.getCookie.mockResolvedValueOnce(OLD).mockResolvedValueOnce(NEW);
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response("[]"));

    const res = await createFleetSession(INPUT).request("https://fleet.test/a");

    expect(res.status).toBe(200);
    expect(cache.invalidate).toHaveBeenCalledWith("int-1", OLD);
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      Cookie: "sid=new",
    });
  });

  it("returns the second rejection rather than retry again", async () => {
    cache.getCookie.mockResolvedValue(OLD);
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 403 }),
    );

    const res = await createFleetSession(INPUT).request("https://fleet.test/a");

    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
