import { APIError } from "better-auth";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DOMAIN_WHITELIST, validateDomain } from "@/lib/auth";

describe("validateDomain", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    process.env.VERCEL_ENV = "production";
  });

  afterEach(() => {
    process.env.VERCEL_ENV = originalVercelEnv;
  });

  it("allows approved domains in production", () => {
    const validDomain = DOMAIN_WHITELIST[0];
    const email = `fake_person@${validDomain}`;
    expect(() => validateDomain(email)).not.toThrow();
  });

  it("rejects unapproved domains in production", () => {
    expect(() => validateDomain("fake_person@baddomain.com")).toThrow(APIError);
  });

  it("does nothing in non-production environments", () => {
    process.env.VERCEL_ENV = "development";

    expect(() => validateDomain("fake_person@baddomain.com")).not.toThrow();
  });
});
