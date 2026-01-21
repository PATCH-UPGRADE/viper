import { APIError } from "better-auth";
import { beforeEach, describe, expect, it } from "vitest";
import { DOMAIN_WHITELIST, validateDomain } from "@/lib/auth";

describe("validateDomain", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "production";
  });

  it("Allow approved domains in production", () => {
    const validDomain = DOMAIN_WHITELIST[0];
    const email = `fake_person@${validDomain}`;
    expect(() => validateDomain(email)).not.toThrow();
  });

  it("Reject unapproved domains in production", () => {
    expect(() => validateDomain("fake_person@baddomain.com")).toThrow(APIError);
  });

  it("Do nothing in non-production environments", () => {
    process.env.VERCEL_ENV = "development";

    expect(() => validateDomain("fake_person@baddomain.com")).not.toThrow();
  });
});
