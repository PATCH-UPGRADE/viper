// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../../../core/types";
import type { MedIsaoConfig, MedIsaoCreds } from "../config";

vi.mock("server-only", () => ({}));

const request = vi.fn();
vi.mock("../session", () => ({
  createMedIsaoSession: (): Session => ({ request }),
}));

const { comments } = await import("../remediations/comments");

const API = "https://dev.example.test";
const REMEDIATION = "rem-1";

const ctx = {
  config: { apiUrl: API } as MedIsaoConfig,
  creds: {} as MedIsaoCreds,
};

/** Captured verbatim from GET /remediations/{id}/comments on the dev instance. */
const LIVE_COMMENT = {
  id: "b08ea157-1d55-477e-bebb-34d120836903",
  remediation_id: "ee907fce-aa80-419c-b05f-70de3529fb08",
  pseudonym: "d8e1446573758b0ce9d1050761617c414647e7644f5747a500ad41fd67403d21",
  body: "this is a quick viper test",
  created_at: "2026-08-27T17:37:17.269311Z",
};

const page = (results: unknown[], next: string | null = null) =>
  new Response(JSON.stringify({ next, previous: null, results }), {
    status: 200,
  });

beforeEach(() => vi.clearAllMocks());

describe("reading comments", () => {
  it("parses the live payload", async () => {
    request.mockResolvedValue(page([LIVE_COMMENT]));

    const result = await comments.list(ctx, REMEDIATION);

    expect(result.items).toEqual([
      {
        externalId: LIVE_COMMENT.id,
        pseudonym: LIVE_COMMENT.pseudonym,
        body: LIVE_COMMENT.body,
        createdAt: LIVE_COMMENT.created_at,
      },
    ]);
  });

  it("asks the endpoint scoped to the remediation", async () => {
    request.mockResolvedValue(page([]));

    await comments.list(ctx, REMEDIATION);

    expect(request).toHaveBeenCalledWith(
      `${API}/api/public/v1/remediations/${REMEDIATION}/comments`,
    );
  });

  it("returns one page and the cursor for the next", async () => {
    request.mockResolvedValue(page([LIVE_COMMENT], `${API}/page-2`));

    const result = await comments.list(ctx, REMEDIATION);

    expect(result.nextCursor).toBe(`${API}/page-2`);
  });

  it("follows a cursor as given, rather than rebuilding the url", async () => {
    request.mockResolvedValue(page([]));

    await comments.list(ctx, REMEDIATION, `${API}/page-2?cursor=abc`);

    expect(request).toHaveBeenCalledWith(`${API}/page-2?cursor=abc`);
  });

  // Comments inherit the remediation's visibility exactly, so a manufacturer
  // unpublishing it is an empty list rather than a broken page.
  // The cursor is client input, and the session signs every request with the
  // API key. An unbounded cursor would send that key wherever the caller liked.
  it("refuses a cursor pointing at another origin, before calling it", async () => {
    await expect(
      comments.list(ctx, REMEDIATION, "https://attacker.test/steal"),
    ).rejects.toThrow(/Refusing to follow/);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a cursor that is not a url at all", async () => {
    await expect(comments.list(ctx, REMEDIATION, "not-a-url")).rejects.toThrow(
      /Refusing to follow/,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("reads a vanished remediation as no comments", async () => {
    request.mockResolvedValue(new Response("", { status: 404 }));

    const result = await comments.list(ctx, REMEDIATION);

    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it("still fails on a fault that is not a 404", async () => {
    request.mockResolvedValue(new Response("", { status: 500 }));

    await expect(comments.list(ctx, REMEDIATION)).rejects.toThrow(/500/);
  });
});

describe("posting a comment", () => {
  const draft = {
    body: "  We saw 90 minutes, not 30.  ",
    authorExternalUserId: "user-1",
  };

  it("asserts the only provider a channel token may claim", async () => {
    request.mockResolvedValue(
      new Response(JSON.stringify(LIVE_COMMENT), { status: 201 }),
    );

    await comments.create(ctx, REMEDIATION, draft);

    const [url, init] = request.mock.calls[0];
    expect(url).toBe(
      `${API}/api/public/v1/remediations/${REMEDIATION}/comments`,
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      author_provider: "viper",
      author_external_user_id: "user-1",
      body: "We saw 90 minutes, not 30.",
    });
  });

  it("returns what every other reader sees, pseudonym included", async () => {
    request.mockResolvedValue(
      new Response(JSON.stringify(LIVE_COMMENT), { status: 201 }),
    );

    const created = await comments.create(ctx, REMEDIATION, draft);

    expect(created.pseudonym).toBe(LIVE_COMMENT.pseudonym);
    expect(created.externalId).toBe(LIVE_COMMENT.id);
  });

  it("refuses a blank comment without calling the platform", async () => {
    await expect(
      comments.create(ctx, REMEDIATION, { ...draft, body: "   " }),
    ).rejects.toThrow(/blank/);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a comment past the platform's limit", async () => {
    await expect(
      comments.create(ctx, REMEDIATION, { ...draft, body: "x".repeat(10_001) }),
    ).rejects.toThrow(/10000 characters/);
    expect(request).not.toHaveBeenCalled();
  });

  it("reports the status when the platform rejects the post", async () => {
    request.mockResolvedValue(new Response("", { status: 400 }));

    await expect(
      comments.create(ctx, REMEDIATION, draft),
    ).rejects.toMatchObject({ status: 400 });
  });
});
