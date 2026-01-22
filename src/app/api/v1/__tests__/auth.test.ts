import { APIError } from "better-auth";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateDomain } from "@/lib/auth";

describe("validateDomain", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    process.env.VERCEL_ENV = "production";
  });

  afterEach(() => {
    process.env.VERCEL_ENV = originalVercelEnv;
  });

  it("rejects unapproved domains in production", () => {
    expect(() => validateDomain("fake_person@baddomain.com")).toThrow(APIError);
  });

  it("does nothing in non-production environments", () => {
    process.env.VERCEL_ENV = "development";

    expect(() => validateDomain("fake_person@baddomain.com")).not.toThrow();
  });
});
