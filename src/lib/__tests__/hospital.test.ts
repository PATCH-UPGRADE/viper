// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hospitalIdentifier } = await import("../hospital");

afterEach(() => vi.unstubAllEnvs());

describe("hospitalIdentifier", () => {
  it("uses the configured name, trimmed", () => {
    vi.stubEnv("HOSPITAL_IDENTIFIER", "  st-elsewhere  ");
    expect(hospitalIdentifier()).toBe("st-elsewhere");
  });

  // A partner derives stable handles from this name, so a deployment that
  // ships under a placeholder cannot be renamed without abandoning them.
  it("refuses to name the hospital for us", () => {
    vi.stubEnv("HOSPITAL_IDENTIFIER", "");
    expect(() => hospitalIdentifier()).toThrow(
      /HOSPITAL_IDENTIFIER is not set/,
    );
  });

  it("treats a whitespace-only name as unset", () => {
    vi.stubEnv("HOSPITAL_IDENTIFIER", "   ");
    expect(() => hospitalIdentifier()).toThrow(
      /HOSPITAL_IDENTIFIER is not set/,
    );
  });
});
