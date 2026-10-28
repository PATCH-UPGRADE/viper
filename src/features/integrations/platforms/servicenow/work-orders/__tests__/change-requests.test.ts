// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TicketCategory, TicketStatus } from "@/generated/prisma";
import type { Page, Session } from "../../../../core/types";
import {
  type ChangeRequest,
  get,
  listChanged,
  mapStatus,
  PAGE_SIZE,
  toCanonical,
  toIso,
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
      summary: "CHG0000001: Rollback Oracle Version",
      status: TicketStatus.TO_DO,
      category: TicketCategory.OTHER,
      scheduledAt: "2026-04-16T23:00:00Z",
      scheduledEndTime: "2026-04-17T01:00:00Z",
    });
    expect(item.body).toContain("Roll back to the previous version.");
  });

  it("leaves the window empty when the change has no planned times", () => {
    const item = toCanonical(
      record({ start_date: "", end_date: "", short_description: "" }),
    );

    expect(item.scheduledAt).toBeNull();
    expect(item.scheduledEndTime).toBeNull();
    expect(item.summary).toBe("CHG0000001");
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
