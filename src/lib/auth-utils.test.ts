// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, headerGetMock, redirectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  headerGetMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: headerGetMock }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("./auth", () => ({ auth: { api: { getSession: getSessionMock } } }));

const { requireAuth, requireUnauth } = await import("./auth-utils");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAuth", () => {
  it("redirects to /login carrying the captured path (with query) as ?next=", async () => {
    getSessionMock.mockResolvedValue(null);
    headerGetMock.mockReturnValue("/assets/123?tab=vulnerabilities");

    await requireAuth();

    expect(redirectMock).toHaveBeenCalledWith(
      "/login?next=%2Fassets%2F123%3Ftab%3Dvulnerabilities",
    );
  });

  it("redirects to a bare /login when the request-path header is absent", async () => {
    getSessionMock.mockResolvedValue(null);
    headerGetMock.mockReturnValue(null);

    await requireAuth();

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("ignores an off-origin header value and falls back to /login", async () => {
    getSessionMock.mockResolvedValue(null);
    headerGetMock.mockReturnValue("https://evil.com");

    await requireAuth();

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});

describe("requireUnauth", () => {
  it("forwards a signed-in user to a valid next", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });

    await requireUnauth("/work-orders/123");

    expect(redirectMock).toHaveBeenCalledWith("/work-orders/123");
  });

  it("falls back to / for a missing or unsafe next", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });

    await requireUnauth("//evil.com");

    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
