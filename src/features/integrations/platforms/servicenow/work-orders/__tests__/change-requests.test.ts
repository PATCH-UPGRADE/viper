// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TicketStatus } from "@/generated/prisma";
import type { Page, Session } from "../../../../core/types";
import {
  type ChangeRequest,
  changeRequestExists,
  get,
  listChanged,
  listDeleted,
  mapStatus,
  PAGE_SIZE,
  toCanonical,
  toIso,
  update,
} from "../change-requests";

const record = (overrides: Partial<ChangeRequest> = {}): ChangeRequest => ({
  sys_id: "a1b2c3",
  number: "CHG0000001",
  short_description: "Rollback Oracle Version",
  description: "Roll back to the previous version.",
  state: "-5",
  type: "normal",
  start_date: "2026-04-16 23:00:00",
  end_date: "2026-04-17 01:00:00",
  sys_updated_on: "2026-04-10 12:00:00",
  category: "Network",
  priority: "4",
  assignment_group: "287ebd7da9fe198100f92cc8d1d2154e",
  cmdb_ci: "",
  ...overrides,
});

const json = (result: unknown): Response =>
  new Response(JSON.stringify({ result }), {
    headers: { "content-type": "application/json;charset=UTF-8" },
  });

/** A session that answers each request from `results` in order and records the URLs. */
const fakeSession = (results: unknown[]) => {
  const urls: URL[] = [];
  const session: Session = {
    request: vi.fn(async (path: string) => {
      urls.push(new URL(path, "https://dev.service-now.com"));
      return json(results[urls.length - 1] ?? []);
    }),
  };
  return { session, urls };
};

const collect = async (
  pages: AsyncIterable<Page<ChangeRequest>>,
): Promise<Page<ChangeRequest>[]> => {
  const out: Page<ChangeRequest>[] = [];
  for await (const page of pages) out.push(page);
  return out;
};

const fullPage = (updatedOn: string, prefix: string): ChangeRequest[] =>
  Array.from({ length: PAGE_SIZE }, (_, i) =>
    record({ sys_id: `${prefix}${i}`, sys_updated_on: updatedOn }),
  );

describe("mapStatus", () => {
  it.each([
    ["-5", TicketStatus.TO_DO],
    ["-4", TicketStatus.TO_DO],
    ["-3", TicketStatus.REQUIRES_APPROVAL],
    ["-2", TicketStatus.TO_DO],
    ["-1", TicketStatus.IN_PROGRESS],
    ["0", TicketStatus.IN_PROGRESS],
    ["3", TicketStatus.DONE],
    ["4", TicketStatus.DONE],
  ])("maps state %s to %s", (state, status) => {
    expect(mapStatus(state)).toBe(status);
  });

  it("reads a state the instance added as not started", () => {
    expect(mapStatus("42")).toBe(TicketStatus.TO_DO);
    expect(mapStatus("")).toBe(TicketStatus.TO_DO);
  });
});

describe("toIso", () => {
  it("reads a raw ServiceNow datetime as UTC", () => {
    expect(toIso("2026-04-16 23:00:00")).toBe("2026-04-16T23:00:00Z");
  });

  it("returns null for an empty or unexpected value", () => {
    expect(toIso("")).toBeNull();
    expect(toIso("04/16/2026 11:00 PM")).toBeNull();
  });
});

describe("toCanonical", () => {
  it("maps a change request onto a work order", () => {
    const item = toCanonical(record());

    expect(item).toMatchObject({
      externalId: "a1b2c3",
      status: TicketStatus.TO_DO,
      scheduledAt: "2026-04-16T23:00:00Z",
      scheduledEndTime: "2026-04-17T01:00:00Z",
    });
  });

  it("leaves the category to VIPER", () => {
    expect(toCanonical(record())).not.toHaveProperty("category");
  });

  it("keeps the text as it is, so an edit maps straight back", () => {
    const item = toCanonical(record());

    expect(item.summary).toBe("Rollback Oracle Version");
    expect(item.body).toBe("Roll back to the previous version.");
  });

  it("leaves the window empty when the change has no planned times", () => {
    const item = toCanonical(record({ start_date: "", end_date: "" }));

    expect(item.scheduledAt).toBeNull();
    expect(item.scheduledEndTime).toBeNull();
  });

  it("uses the number when the change has no short description", () => {
    expect(toCanonical(record({ short_description: "" })).summary).toBe(
      "CHG0000001",
    );
  });
});

describe("listChanged", () => {
  it("asks for raw values, a fixed field list and a stable order", async () => {
    const { session, urls } = fakeSession([[record()]]);

    await collect(listChanged(session, null));

    const params = urls[0].searchParams;
    expect(urls[0].pathname).toBe("/api/now/table/change_request");
    expect(params.get("sysparm_display_value")).toBe("false");
    expect(params.get("sysparm_exclude_reference_link")).toBe("true");
    expect(params.get("sysparm_fields")).toContain("sys_updated_on");
    expect(params.get("sysparm_query")).toMatch(
      /\^ORDERBYsys_updated_on\^ORDERBYsys_id$/,
    );
  });

  describe("on the first sync", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-05-02T10:00:00Z") });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("asks only for changes from the last 12 months", async () => {
      const { session, urls } = fakeSession([[]]);

      const pages = await collect(listChanged(session, null));

      expect(urls[0].searchParams.get("sysparm_query")).toBe(
        "sys_updated_on>=2025-05-07 10:00:00^ORDERBYsys_updated_on^ORDERBYsys_id",
      );
      expect(pages).toEqual([
        { items: [], cursor: { updatedOn: "2025-05-07 10:00:00" } },
      ]);
    });

    it("uses a saved cursor that is older than the window", async () => {
      const { session, urls } = fakeSession([[]]);

      await collect(listChanged(session, { updatedOn: "2020-01-01 00:00:00" }));

      expect(urls[0].searchParams.get("sysparm_query")).toBe(
        "sys_updated_on>=2020-01-01 00:00:00^ORDERBYsys_updated_on^ORDERBYsys_id",
      );
    });
  });

  it("resumes from the cursor and returns the newest timestamp", async () => {
    const { session, urls } = fakeSession([
      [record({ sys_updated_on: "2026-05-01 08:00:00" })],
    ]);

    const pages = await collect(
      listChanged(session, { updatedOn: "2026-04-30 00:00:00" }),
    );

    expect(urls[0].searchParams.get("sysparm_query")).toBe(
      "sys_updated_on>=2026-04-30 00:00:00^ORDERBYsys_updated_on^ORDERBYsys_id",
    );
    expect(pages.at(-1)?.cursor).toEqual({ updatedOn: "2026-05-01 08:00:00" });
  });

  it("keeps the old cursor when nothing changed", async () => {
    const { session } = fakeSession([[]]);

    const pages = await collect(
      listChanged(session, { updatedOn: "2026-04-30 00:00:00" }),
    );

    expect(pages).toEqual([
      { items: [], cursor: { updatedOn: "2026-04-30 00:00:00" } },
    ]);
  });

  it("restarts each page from the last timestamp and drops repeats by id", async () => {
    const first = fullPage("2026-05-01 08:00:00", "a");
    // The inclusive query returns the records of the first page's last second again.
    const second = [
      first[PAGE_SIZE - 1],
      record({ sys_id: "b0", sys_updated_on: "2026-05-02 09:00:00" }),
    ];
    const { session, urls } = fakeSession([first, second]);

    const pages = await collect(listChanged(session, null));

    expect(urls[1].searchParams.get("sysparm_query")).toBe(
      "sys_updated_on>=2026-05-01 08:00:00^ORDERBYsys_updated_on^ORDERBYsys_id",
    );
    expect(urls[1].searchParams.get("sysparm_offset")).toBe("0");
    expect(pages[1].items.map((r) => r.sys_id)).toEqual(["b0"]);
    expect(pages.flatMap((p) => p.items)).toHaveLength(PAGE_SIZE + 1);
  });

  it("yields a record again when it changed during the pull", async () => {
    const first = fullPage("2026-05-01 08:00:00", "a");
    const second = [
      record({ sys_id: "a0", sys_updated_on: "2026-05-02 09:00:00" }),
    ];
    const { session } = fakeSession([first, second]);

    const pages = await collect(listChanged(session, null));

    expect(pages[1].items).toEqual(second);
    expect(pages.at(-1)?.cursor).toEqual({ updatedOn: "2026-05-02 09:00:00" });
  });

  it("advances the offset when a full page sits inside one second", async () => {
    const since = "2026-05-01 08:00:00";
    const { session, urls } = fakeSession([
      fullPage(since, "a"),
      [record({ sys_id: "b0", sys_updated_on: since })],
    ]);

    const pages = await collect(listChanged(session, { updatedOn: since }));

    expect(urls[1].searchParams.get("sysparm_offset")).toBe(String(PAGE_SIZE));
    expect(pages.flatMap((p) => p.items)).toHaveLength(PAGE_SIZE + 1);
  });

  describe("with a record dated in the future", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-05-02T10:00:00Z") });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("keeps the cursor behind the start of the sync", async () => {
      const future = record({
        sys_id: "f0",
        sys_updated_on: "2035-08-22 12:30:56",
      });
      const { session } = fakeSession([[record(), future]]);

      const pages = await collect(listChanged(session, null));

      expect(pages.at(-1)?.items).toContainEqual(future);
      expect(pages.at(-1)?.cursor).toEqual({
        updatedOn: "2026-05-02 09:55:00",
      });
    });

    it("pulls back a cursor that is already past the limit", async () => {
      const future = record({
        sys_id: "f0",
        sys_updated_on: "2035-08-22 12:30:56",
      });
      const { session } = fakeSession([[future]]);

      const pages = await collect(
        listChanged(session, { updatedOn: "2035-08-22 12:30:56" }),
      );

      expect(pages.at(-1)?.cursor).toEqual({
        updatedOn: "2026-05-02 09:55:00",
      });
    });

    it("keeps a cursor that is older than the limit", async () => {
      const { session } = fakeSession([
        [record({ sys_updated_on: "2026-05-02 09:54:59" })],
      ]);

      const pages = await collect(listChanged(session, null));

      expect(pages.at(-1)?.cursor).toEqual({
        updatedOn: "2026-05-02 09:54:59",
      });
    });
  });

  it("reports an HTML response instead of failing to parse it", async () => {
    const session: Session = {
      request: async () =>
        new Response("<html>Your instance is hibernating</html>", {
          headers: { "content-type": "text/html" },
        }),
    };

    await expect(collect(listChanged(session, null))).rejects.toThrow(
      /non-JSON.*instance URL/,
    );
  });

  it("names rejected credentials", async () => {
    const session: Session = {
      request: async () => new Response("", { status: 401 }),
    };

    await expect(collect(listChanged(session, null))).rejects.toThrow(/401/);
  });
});

describe("update", () => {
  /** A session that answers with `result` and records each request. */
  const recordingSession = (result: unknown, status = 200) => {
    const calls: { url: URL; init?: RequestInit }[] = [];
    const session: Session = {
      request: vi.fn(async (path: string, init?: RequestInit) => {
        calls.push({ url: new URL(path, "https://dev.service-now.com"), init });
        return status === 200 ? json(result) : new Response("", { status });
      }),
    };
    return { session, calls };
  };
  const sentBody = (init?: RequestInit) => JSON.parse(String(init?.body));

  it("patches the change request by sys_id and returns the saved record", async () => {
    const { session, calls } = recordingSession(record());

    const result = await update(session, "a1b2c3", { summary: "New title" });

    expect(calls[0].init?.method).toBe("PATCH");
    expect(calls[0].url.pathname).toBe("/api/now/table/change_request/a1b2c3");
    expect(calls[0].url.searchParams.get("sysparm_display_value")).toBe(
      "false",
    );
    expect(result).toEqual({ externalId: "a1b2c3", raw: record() });
  });

  it("maps the VIPER fields onto the change request fields", async () => {
    const { session, calls } = recordingSession(record());

    await update(session, "a1b2c3", {
      summary: "New title",
      description: "New body",
      scheduledAt: "2026-11-02T14:00:00.000Z",
      scheduledEndTime: "2026-11-02T16:00:00.000Z",
    });

    expect(sentBody(calls[0].init)).toEqual({
      short_description: "New title",
      description: "New body",
      start_date: "2026-11-02 14:00:00",
      end_date: "2026-11-02 16:00:00",
    });
  });

  it("sends only the fields in the patch", async () => {
    const { session, calls } = recordingSession(record());

    await update(session, "a1b2c3", { description: "New body" });

    expect(sentBody(calls[0].init)).toEqual({ description: "New body" });
  });

  it("clears a time with an empty string", async () => {
    const { session, calls } = recordingSession(record());

    await update(session, "a1b2c3", {
      scheduledAt: null,
      scheduledEndTime: null,
    });

    expect(sentBody(calls[0].init)).toEqual({ start_date: "", end_date: "" });
  });

  it("points at the integration user's permissions on a 403", async () => {
    const { session } = recordingSession(null, 403);

    await expect(
      update(session, "a1b2c3", { summary: "New title" }),
    ).rejects.toThrow(/403.*integration user's permissions/);
  });
});

describe("get", () => {
  it("reads one change request by sys_id", async () => {
    const { session, urls } = fakeSession([record()]);

    const found = await get(session, "a1b2c3");

    expect(urls[0].pathname).toBe("/api/now/table/change_request/a1b2c3");
    expect(found.number).toBe("CHG0000001");
  });

  it("keeps the unmapped fields, so the snapshot records them", async () => {
    const { session, urls } = fakeSession([record()]);

    const found = await get(session, "a1b2c3");

    expect(urls[0].searchParams.get("sysparm_fields")).toContain(
      "assignment_group",
    );
    expect(found).toMatchObject({
      category: "Network",
      priority: "4",
      assignment_group: "287ebd7da9fe198100f92cc8d1d2154e",
      cmdb_ci: "",
    });
  });
});

describe("listDeleted", () => {
  const saved = { deletedOn: "2026-04-30 00:00:00" };
  const row = (documentkey: string, sys_created_on: string) => ({
    sys_id: `audit-${documentkey}`,
    documentkey,
    sys_created_on,
  });

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-05-02T10:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads change request rows from the delete log in a stable order", async () => {
    const { session, urls } = fakeSession([[]]);

    await listDeleted(session, saved);

    expect(urls[0].pathname).toBe("/api/now/table/sys_audit_delete");
    expect(urls[0].searchParams.get("sysparm_query")).toBe(
      "tablename=change_request^sys_created_on>=2026-04-30 00:00:00^ORDERBYsys_created_on^ORDERBYsys_id",
    );
  });

  it("returns the sys_id of each deleted record and the newest time", async () => {
    const { session } = fakeSession([[row("a1", "2026-05-01 08:00:00")]]);

    await expect(listDeleted(session, saved)).resolves.toEqual({
      externalIds: ["a1"],
      deletedOn: "2026-05-01 08:00:00",
    });
  });

  it("starts 12 months back, and keeps that start while the log is empty", async () => {
    const { session, urls } = fakeSession([[]]);

    await expect(listDeleted(session, null)).resolves.toEqual({
      externalIds: [],
      deletedOn: "2025-05-07 10:00:00",
    });
    expect(urls[0].searchParams.get("sysparm_query")).toContain(
      "sys_created_on>=2025-05-07 10:00:00",
    );
  });

  it("keeps a saved cursor when the log has nothing new", async () => {
    const { session } = fakeSession([[]]);

    await expect(listDeleted(session, saved)).resolves.toEqual({
      externalIds: [],
      deletedOn: "2026-04-30 00:00:00",
    });
  });

  it("keeps the cursor behind the start of the sync", async () => {
    const { session } = fakeSession([[row("a1", "2026-05-02 09:59:00")]]);

    const { deletedOn } = await listDeleted(session, saved);

    expect(deletedOn).toBe("2026-05-02 09:55:00");
  });

  describe("with the total count of the query", () => {
    const withTotal = (total: string): Session => ({
      request: vi.fn(
        async () =>
          new Response(JSON.stringify({ result: [] }), {
            headers: {
              "content-type": "application/json",
              "x-total-count": total,
            },
          }),
      ),
    });

    it("throws when ServiceNow counts rows but returns none", async () => {
      await expect(listDeleted(withTotal("1"), null)).rejects.toThrow(
        "sys_audit_delete returned no rows, but X-Total-Count is 1.",
      );
    });

    it("reads a count of 0 as an empty log", async () => {
      await expect(listDeleted(withTotal("0"), saved)).resolves.toEqual({
        externalIds: [],
        deletedOn: "2026-04-30 00:00:00",
      });
    });

    it("asks ServiceNow for the count", async () => {
      const { session, urls } = fakeSession([[]]);

      await listDeleted(session, null);

      expect(urls[0].searchParams.has("sysparm_no_count")).toBe(false);
    });
  });

  it("restarts each page from the last time and drops repeats", async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) =>
      row(`a${i}`, "2026-05-01 08:00:00"),
    );
    const { session, urls } = fakeSession([full, [full[0]]]);

    const { externalIds } = await listDeleted(session, saved);

    expect(urls[1].searchParams.get("sysparm_query")).toContain(
      "sys_created_on>=2026-05-01 08:00:00",
    );
    expect(externalIds).toHaveLength(PAGE_SIZE);
  });
});

describe("changeRequestExists", () => {
  const withStatus = (response: Response): Session => ({
    request: vi.fn(async () => response),
  });

  it("is false on a 404", async () => {
    const session = withStatus(new Response("{}", { status: 404 }));

    await expect(changeRequestExists(session, "a1")).resolves.toBe(false);
  });

  it("is true when the record comes back", async () => {
    const session = withStatus(json({ sys_id: "a1" }));

    await expect(changeRequestExists(session, "a1")).resolves.toBe(true);
  });

  it("throws on any other failure, so a ticket is not deleted by mistake", async () => {
    const session = withStatus(new Response("{}", { status: 500 }));

    await expect(changeRequestExists(session, "a1")).rejects.toThrow("500");
  });
});
