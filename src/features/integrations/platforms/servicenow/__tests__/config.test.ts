import { describe, expect, it } from "vitest";
import { configSchema } from "../config";

describe("configSchema", () => {
  it("accepts an https instance URL", () => {
    expect(
      configSchema.safeParse({ instanceUrl: "https://dev.service-now.com" })
        .success,
    ).toBe(true);
  });

  it("rejects a plain http instance URL", () => {
    expect(
      configSchema.safeParse({ instanceUrl: "http://dev.service-now.com" })
        .success,
    ).toBe(false);
  });

  it("rejects a value that is not a URL without throwing", () => {
    expect(configSchema.safeParse({ instanceUrl: "not a url" }).success).toBe(
      false,
    );
  });
});
