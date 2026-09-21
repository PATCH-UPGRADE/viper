// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { credentialSchema } from "../config";
import { createMedIsaoSession } from "../session";

vi.mock("server-only", () => ({}));

describe("MedISAO credentials", () => {
  it("takes an api token", () => {
    expect(credentialSchema.parse({ apiToken: "abc" })).toEqual({
      apiToken: "abc",
    });
  });

  it("refuses a blank token", () => {
    expect(() => credentialSchema.parse({ apiToken: "" })).toThrow();
  });

  // The generic auth schema also allows basic, header and no auth. MedISAO
  // reads none of them, so configuring one would only ever produce a 401.
  it("refuses a scheme MedISAO cannot read", () => {
    expect(() =>
      credentialSchema.parse({
        authType: "Basic",
        authentication: { username: "u", password: "p" },
      }),
    ).toThrow();
    expect(() => credentialSchema.parse({ authType: "None" })).toThrow();
  });
});

describe("the session", () => {
  it("sends the token as a bearer, the only scheme MedISAO accepts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createMedIsaoSession({ apiToken: "abc" }).request("https://x.test/a");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer abc");
    vi.unstubAllGlobals();
  });
});
