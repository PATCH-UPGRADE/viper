import { describe, expect, it } from "vitest";
import { getSafeRedirectPath, withNextParam } from "./auth-redirect";

describe("getSafeRedirectPath", () => {
  it("accepts app-relative paths, query string preserved", () => {
    for (const ok of [
      "/",
      "/foo",
      "/foo/bar",
      "/foo?x=1",
      "/foo/bar?tab=a&page=2",
      "/assets/abc/work-orders/123?tab=details",
    ]) {
      expect(getSafeRedirectPath(ok)).toBe(ok);
    }
  });

  it("rejects missing, external, or non-path values", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "https://evil.com",
      "http://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t//evil.com",
      "/\n/evil.com",
      "javascript:alert(1)",
      "data:text/html,test",
      "mailto:test@example.com",
      "evil.com",
    ]) {
      expect(getSafeRedirectPath(bad)).toBeNull();
    }
  });
});

describe("withNextParam", () => {
  it("returns the path unchanged when next is null", () => {
    expect(withNextParam("/signup", null)).toBe("/signup");
    expect(withNextParam("/login?verified=1", null)).toBe("/login?verified=1");
  });

  it("uses `?` for a bare path and `&` when a query already exists", () => {
    expect(withNextParam("/signup", "/assets/1")).toBe(
      "/signup?next=%2Fassets%2F1",
    );
    expect(withNextParam("/login?verified=1", "/assets/1?tab=x")).toBe(
      "/login?verified=1&next=%2Fassets%2F1%3Ftab%3Dx",
    );
  });
});
