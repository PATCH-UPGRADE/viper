// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  ingest: vi.fn(),
  listMapped: vi.fn(),
  deleteTickets: vi.fn(),
}));

vi.mock("@/features/integrations/core/sync/work-order-sources", () => ({
  ingestPulledWorkOrders: mocks.ingest,
  listMappedWorkOrders: mocks.listMapped,
  deletePulledWorkOrders: mocks.deleteTickets,
}));

import type { ResourceSyncCtx } from "../../../../core/types";
import type { ServiceNowConfig, ServiceNowCreds } from "../../config";
import { syncWorkOrders } from "../sync";

const json = (result: unknown): Response =>
  new Response(JSON.stringify({ result }), {
    headers: { "content-type": "application/json" },
  });

const auditRow = {
  sys_id: "audit-1",
  documentkey: "gone-1",
  sys_created_on: "2026-05-01 08:00:00",
};

/** Answers each table by its URL, so the order of the requests does not matter. */
const ctxWith = (
  deleteLog: () => Response,
  liveRecord: (externalId: string) => Response,
  cursor: unknown = { updatedOn: "2026-04-30 00:00:00" },
) =>
  ({
    integrationId: "int-1",
    integrationUserId: "user-1",
    cursor,
    session: {
      request: vi.fn(async (path: string) => {
        const { pathname } = new URL(path, "https://dev.service-now.com");
        if (pathname.endsWith("/sys_audit_delete")) return deleteLog();
        if (pathname.endsWith("/change_request")) return json([]);
        return liveRecord(pathname.split("/").at(-1) ?? "");
      }),
    },
  }) as unknown as ResourceSyncCtx<ServiceNowConfig, ServiceNowCreds>;

const notFound = () => new Response("{}", { status: 404 });

describe("syncWorkOrders delete pass", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date("2026-05-02T10:00:00Z") });
    mocks.ingest.mockResolvedValue({ shouldRetry: false, message: "" });
    mocks.listMapped.mockImplementation(async (_id, ids: string[]) => ids);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    warn.mockRestore();
  });

  it("deletes the ticket of a change request that ServiceNow deleted", async () => {
    const outcome = await syncWorkOrders(
      ctxWith(() => json([auditRow]), notFound),
    );

    expect(mocks.deleteTickets).toHaveBeenCalledWith("int-1", ["gone-1"]);
    expect(outcome.cursor).toMatchObject({
      deletedOn: "2026-05-01 08:00:00",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps the ticket of a change request that ServiceNow restored", async () => {
    await syncWorkOrders(
      ctxWith(
        () => json([auditRow]),
        () => json({ sys_id: "gone-1" }),
      ),
    );

    expect(mocks.deleteTickets).toHaveBeenCalledWith("int-1", []);
  });

  it("does not look up a deleted record that VIPER never mapped", async () => {
    mocks.listMapped.mockResolvedValue([]);
    const liveRecord = vi.fn(notFound);

    await syncWorkOrders(ctxWith(() => json([auditRow]), liveRecord));

    expect(liveRecord).not.toHaveBeenCalled();
  });

  it("warns and keeps the pull's result when the delete log refuses", async () => {
    const outcome = await syncWorkOrders(
      ctxWith(() => new Response("{}", { status: 403 }), notFound, {
        updatedOn: "2026-04-30 00:00:00",
        deletedOn: "2026-04-29 00:00:00",
      }),
    );

    expect(warn).toHaveBeenCalledOnce();
    expect(mocks.deleteTickets).not.toHaveBeenCalled();
    expect(outcome.cursor).toEqual({
      updatedOn: "2026-04-30 00:00:00",
      deletedOn: "2026-04-29 00:00:00",
    });
  });

  it("warns when ServiceNow hides the rows of the delete log", async () => {
    const outcome = await syncWorkOrders(
      ctxWith(
        () =>
          new Response(JSON.stringify({ result: [] }), {
            headers: {
              "content-type": "application/json",
              "x-total-count": "1",
            },
          }),
        notFound,
      ),
    );

    expect(warn).toHaveBeenCalledOnce();
    expect(outcome.cursor).toEqual({ updatedOn: "2026-04-30 00:00:00" });
  });

  it("does not warn when the delete log has no rows", async () => {
    await syncWorkOrders(ctxWith(() => json([]), notFound));

    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps the cursor when a lookup fails, so the next sync tries again", async () => {
    const outcome = await syncWorkOrders(
      ctxWith(
        () => json([auditRow]),
        () => new Response("{}", { status: 500 }),
      ),
    );

    expect(mocks.deleteTickets).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(outcome.cursor).toEqual({ updatedOn: "2026-04-30 00:00:00" });
  });

  it("does not run when the pull fails", async () => {
    mocks.ingest.mockResolvedValue({
      shouldRetry: true,
      message: "pull failed",
    });
    const ctx = ctxWith(() => json([auditRow]), notFound);

    await expect(syncWorkOrders(ctx)).rejects.toThrow("pull failed");

    expect(mocks.deleteTickets).not.toHaveBeenCalled();
  });
});
