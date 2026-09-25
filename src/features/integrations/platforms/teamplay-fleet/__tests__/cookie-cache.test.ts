// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fingerprintOf, getCookie, invalidate } from "../cookie-cache";
import type { CapturedSession } from "../session";

const KEY = fingerprintOf({ username: "svc@example.com", password: "pw" });
const ROTATED = fingerprintOf({ username: "svc@example.com", password: "new" });

let logins = 0;
const cookie = (expiresAt: Date | null = null): CapturedSession => ({
  header: "Cookie",
  value: `sid=${++logins}`,
  expiresAt,
});
const login = vi.fn(async () => cookie());

// The cache is process-wide, so each test gets its own integrations.
let run = 0;
let id: string;
let other: string;

beforeEach(() => {
  run++;
  id = `int-${run}`;
  other = `other-${run}`;
  logins = 0;
  login.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Fleet cookie cache", () => {
  it("reuses one login for one integration", async () => {
    const first = await getCookie(id, KEY, login);
    const second = await getCookie(id, KEY, login);

    expect(second).toBe(first);
    expect(login).toHaveBeenCalledTimes(1);
  });

  it("keeps integrations apart", async () => {
    await getCookie(id, KEY, login);
    await getCookie(other, KEY, login);

    expect(login).toHaveBeenCalledTimes(2);
  });

  it("shares one login between concurrent callers", async () => {
    const [a, b, c] = await Promise.all([
      getCookie(id, KEY, login),
      getCookie(id, KEY, login),
      getCookie(id, KEY, login),
    ]);

    expect(login).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("signs in again when the credentials change", async () => {
    await getCookie(id, KEY, login);
    await getCookie(id, ROTATED, login);

    expect(login).toHaveBeenCalledTimes(2);
  });

  it("signs in again once the cookie is about to expire", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
    login.mockImplementationOnce(async () =>
      cookie(new Date("2026-01-01T00:10:00Z")),
    );
    await getCookie(id, KEY, login);

    vi.setSystemTime(new Date("2026-01-01T00:09:30Z"));
    const next = await getCookie(id, KEY, login);

    expect(login).toHaveBeenCalledTimes(2);
    expect(next.value).toBe("sid=2");
  });

  it("does not keep a failed login", async () => {
    login.mockRejectedValueOnce(new Error("Fleet rejected credentials"));
    await expect(getCookie(id, KEY, login)).rejects.toThrow();

    const next = await getCookie(id, KEY, login);

    expect(login).toHaveBeenCalledTimes(2);
    expect(next.value).toBe("sid=1");
  });

  it("drops a rejected cookie", async () => {
    const first = await getCookie(id, KEY, login);
    invalidate(id, first);
    const next = await getCookie(id, KEY, login);

    expect(next).not.toBe(first);
    expect(login).toHaveBeenCalledTimes(2);
  });

  it("keeps a replacement when a second request rejects the old cookie", async () => {
    const first = await getCookie(id, KEY, login);
    invalidate(id, first);
    const replacement = await getCookie(id, KEY, login);

    invalidate(id, first);

    expect(await getCookie(id, KEY, login)).toBe(replacement);
    expect(login).toHaveBeenCalledTimes(2);
  });
});
