// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../../../core/types";
import type { MedIsaoConfig, MedIsaoCreds } from "../config";

vi.mock("server-only", () => ({}));

const request = vi.fn();
vi.mock("../session", () => ({
  createMedIsaoSession: (): Session => ({ request }),
}));

const { inquiries } = await import("../remediations/inquiries");

const API = "https://dev.example.test";
const REMEDIATION = "rem-1";
const ctx = {
  config: { apiUrl: API } as MedIsaoConfig,
  creds: {} as MedIsaoCreds,
};

const ANSWERED = {
  id: "inq-1",
  remediation_id: REMEDIATION,
  body: "Does this patch need the device off the network?",
  status: "answered",
  response: "No, it applies in place.",
  responded_at: "2026-09-02T10:00:00Z",
  created_at: "2026-09-01T09:00:00Z",
  updated_at: "2026-09-02T10:00:00Z",
};

const page = (results: unknown[], next: string | null = null) =>
  new Response(JSON.stringify({ next, previous: null, results }), {
    status: 200,
  });

beforeEach(() => vi.clearAllMocks());

describe("reading inquiries", () => {
  it("carries the answer through when one has come", async () => {
    request.mockResolvedValue(page([ANSWERED]));

    const { items } = await inquiries.list(ctx, REMEDIATION);

    expect(items[0]).toEqual({
      externalId: "inq-1",
      body: ANSWERED.body,
      status: "answered",
      response: "No, it applies in place.",
      respondedAt: ANSWERED.responded_at,
      createdAt: ANSWERED.created_at,
    });
  });

  it("reads an unanswered question as having no answer", async () => {
    request.mockResolvedValue(
      page([
        { ...ANSWERED, status: "open", response: null, responded_at: null },
      ]),
    );

    const { items } = await inquiries.list(ctx, REMEDIATION);

    expect(items[0].response).toBeNull();
    expect(items[0].respondedAt).toBeNull();
  });

  it("asks the endpoint scoped to the remediation", async () => {
    request.mockResolvedValue(page([]));

    await inquiries.list(ctx, REMEDIATION);

    expect(request).toHaveBeenCalledWith(
      `${API}/api/public/v1/remediations/${REMEDIATION}/inquiries`,
    );
  });

  // The cursor is client input, and the session signs every request with the
  // API key. An unbounded cursor would send that key wherever the caller liked.
  it("refuses a cursor pointing at another origin, before calling it", async () => {
    await expect(
      inquiries.list(ctx, REMEDIATION, "https://attacker.test/steal"),
    ).rejects.toThrow(/Refusing to follow/);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a cursor that is not a url at all", async () => {
    await expect(inquiries.list(ctx, REMEDIATION, "not-a-url")).rejects.toThrow(
      /Refusing to follow/,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("reads a vanished remediation as no questions", async () => {
    request.mockResolvedValue(new Response("", { status: 404 }));

    expect(await inquiries.list(ctx, REMEDIATION)).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});

describe("asking a question", () => {
  // The token says who is asking, so unlike a comment there is no author to
  // assert and nothing identifying in the payload.
  it("sends only the body", async () => {
    request.mockResolvedValue(
      new Response(JSON.stringify(ANSWERED), { status: 201 }),
    );

    await inquiries.create(ctx, REMEDIATION, {
      body: "  Is a reboot needed?  ",
    });

    const [url, init] = request.mock.calls[0];
    expect(url).toBe(
      `${API}/api/public/v1/remediations/${REMEDIATION}/inquiries`,
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ body: "Is a reboot needed?" });
  });

  it("refuses a blank question without calling the platform", async () => {
    await expect(
      inquiries.create(ctx, REMEDIATION, { body: "   " }),
    ).rejects.toThrow(/blank/);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a question past the platform's limit", async () => {
    await expect(
      inquiries.create(ctx, REMEDIATION, { body: "x".repeat(10_001) }),
    ).rejects.toThrow(/10000 characters/);
    expect(request).not.toHaveBeenCalled();
  });

  it("reports the status when the platform rejects it", async () => {
    request.mockResolvedValue(new Response("", { status: 400 }));

    await expect(
      inquiries.create(ctx, REMEDIATION, { body: "hello" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
