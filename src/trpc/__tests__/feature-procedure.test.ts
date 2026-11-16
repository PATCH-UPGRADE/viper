import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockIsEnabled, mockGetSession, mockVerifyApiKey } = vi.hoisted(() => ({
  mockIsEnabled: vi.fn(),
  mockGetSession: vi.fn(),
  mockVerifyApiKey: vi.fn(),
}));

vi.mock("@/lib/features/server", () => ({ isEnabled: mockIsEnabled }));
vi.mock("@/lib/auth-utils", () => ({
  getSession: mockGetSession,
  verifyApiKey: mockVerifyApiKey,
}));

import {
  createCallerFactory,
  createTRPCRouter,
  featureProcedure,
} from "@/trpc/init";

// A one-procedure router, gated on "chat"
const router = createTRPCRouter({
  ping: featureProcedure("chat").query(() => "pong"),
});
const createCaller = createCallerFactory(router);

// biome-ignore lint/suspicious/noExplicitAny: test fixture
const signedIn = createCaller({ auth: { user: { id: "user-test" } } } as any);

// An HTTP request with no session and no API key
// biome-ignore lint/suspicious/noExplicitAny: test fixture
const anonymous = createCaller({
  req: new Request("http://localhost/api/trpc"),
} as any);

beforeEach(() => {
  mockIsEnabled.mockReset().mockReturnValue(true);
  mockGetSession.mockReset().mockResolvedValue(null);
  mockVerifyApiKey
    .mockReset()
    .mockResolvedValue({ valid: false, error: null, key: null });
});

describe("featureProcedure", () => {
  it("runs the procedure when the flag is on", async () => {
    await expect(signedIn.ping()).resolves.toBe("pong");
    expect(mockIsEnabled).toHaveBeenCalledWith("chat");
  });

  it("returns NOT_FOUND when the flag is off", async () => {
    mockIsEnabled.mockReturnValue(false);

    const call = signedIn.ping();
    await expect(call).rejects.toBeInstanceOf(TRPCError);
    await expect(call).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([true, false])(
    "returns UNAUTHORIZED without a session, before checking the flag (flag on: %s)",
    async (flagOn) => {
      mockIsEnabled.mockReturnValue(flagOn);

      await expect(anonymous.ping()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      expect(mockIsEnabled).not.toHaveBeenCalled(); // authentication runs first
    },
  );

  it("accepts a valid API key, like any protected procedure", async () => {
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      error: null,
      key: { referenceId: "user-api" },
    });

    await expect(anonymous.ping()).resolves.toBe("pong");
  });
});
