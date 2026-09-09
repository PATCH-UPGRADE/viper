import { describe, expect, it } from "vitest";
import { getSafeRedirectPath } from "./auth-redirect";

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
      "javascript:alert(1)",
      "data:text/html,test",
      "mailto:test@example.com",
      "evil.com",
    ]) {
      expect(getSafeRedirectPath(bad)).toBeNull();
    }
  });
});
