import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../session", () => ({ createFleetSession: vi.fn() }));

import type { ResourceSyncCtx } from "@/features/integrations/core/types";
import { PlatformEnum, SourceChannel } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { FleetConfig, FleetCreds } from "../../config";
import { createFleetSession } from "../../session";
import { syncAdvisories } from "../sync";

const SAMPLE = {
  id: 25,
  advisoryId: "SSA-016040",
  title: "Insecure Password Encryption Vulnerability in syngo.plaza VB30E",
  cvssScore: 5.3,
  version: "1.0",
  lastUpdated: "2026-02-10T00:00:00.000+00:00",
  tag: null,
  modality: ["Syngo"],
  cveIds: "CVE-2024-52334",
  productsAffected:
    "syngo.plaza VB30E\nAll versions < VB30E_HF01\naffected by CVE-2024-52334",
  activationDate: "2026-02-10T00:00:00.000+00:00",
  active: true,
  severity: "2",
  lastEmailsSent: null,
  enableMail: false,
};

const SAMPLE_2 = {
  ...SAMPLE,
  id: 26,
  advisoryId: "SSA-778899",
  title: "Remote Code Execution in syngo Carbon VA20",
  cvssScore: 9.1,
  cveIds: "CVE-2025-11111, CVE-2025-2222",
  productsAffected: "syngo Carbon VA20\nAll versions < VA20_HF03",
};

const ATTACHMENT = {
  name: "260202 Security Advisory 016040.pdf",
  type: "pdf",
  size: "245339",
  languageCode: "EN",
};

const IDs = ["25", "26"];

let advisories: unknown[] = [SAMPLE, SAMPLE_2];

describe("Fleet advisories sync", () => {
  let ctx: ResourceSyncCtx<FleetConfig, FleetCreds>;
  let integrationId: string;

  beforeAll(async () => {
    vi.mocked(createFleetSession).mockResolvedValue({
      request: async (url: string) =>
        ({
          ok: true,
          json: async () =>
            url.includes("/security-advisories/active")
              ? advisories
              : [ATTACHMENT],
        }) as unknown as Response,
    });
    const integration = await prisma.integration.findFirst({
      where: { platform: PlatformEnum.FLEET },
      select: { id: true, name: true },
    });
    if (!integration) {
      throw new Error("No templay Fleet integration");
    }
    integrationId = integration.id;
    await prisma.externalSourceRecordMapping.deleteMany({
      where: { integrationId, externalId: { in: IDs } },
    });

    ctx = {
      integrationId,
      config: {},
      creds: { username: "unused", password: "unused" },
      cursor: null,
      lastSuccessfulSync: null,
      callback: async () => {
        throw new Error("No callback");
      },
    };
  });
  const readRows = () =>
    prisma.externalSourceRecordMapping.findMany({
      where: { integrationId, externalId: { in: IDs } },
      orderBy: { externalId: "asc" },
      select: {
        externalId: true,
        lastSynced: true,
        upstreamApi: true,
        webUrl: true,
        integration: { select: { id: true, name: true, platform: true } },
        sourceRecords: {
          orderBy: { observedAt: "desc" },
          select: {
            contentHash: true,
            channel: true,
            externalId: true,
            markdown: true,
            observedAt: true,
          },
        },
      },
    });

  const show = (
    label: string,
    rows: Awaited<ReturnType<typeof readRows>>,
  ): void => {
    console.log(`\n=== ${label} ===`);
    console.table(
      rows.map((m) => ({
        advisory: m.externalId,
        snapshots: m.sourceRecords.length,
        lastSynced: m.lastSynced?.toISOString(),
        newestHash: m.sourceRecords[0]?.contentHash.slice(0, 12),
        webUrl: m.webUrl,
      })),
    );
  };

  it("run 1: create a mapping and one snapshot per advisory", async () => {
    const outcome = await syncAdvisories(ctx);
    expect(outcome).toEqual({ cursor: null });
    const rows = await readRows();
    show("run 1 - first sync", rows);

    expect(rows.map((m) => m.externalId)).toEqual(IDs);
    expect(rows[0].sourceRecords).toHaveLength(1);
    expect(rows[1].sourceRecords).toHaveLength(1);

    const newest = rows[0].sourceRecords[0];
    expect(newest.channel).toBe(SourceChannel.Integration);

    expect(newest.externalId).toBeNull();
    expect(newest.markdown).toContain("CVE-2024-52334");
    expect(newest.markdown).toContain("CVSS: 5.3");
    expect(rows[1].sourceRecords[0].markdown).toContain("CVSS: 9.1");
  });

  it("run 2: an unchanged advisory costs no write, but lastSynced still moves", async () => {
    const before = await readRows();
    await syncAdvisories(ctx);

    const after = await readRows();
    show("run 2 - nothing changed upstream", after);
    expect(after[0].lastSynced?.getTime()).toBeGreaterThan(
      before[0].lastSynced?.getTime() ?? 0,
    );
  });

  it("run 3: a revision bump writes exactly one new snapshot", async () => {
    advisories = [{ ...SAMPLE, version: "1.1" }, SAMPLE_2];
    await syncAdvisories(ctx);
    const rows = await readRows();
    show("run 3 - advisory 25 revised to 1.1", rows);

    expect(rows[0].sourceRecords).toHaveLength(2);
    expect(rows[1].sourceRecords).toHaveLength(1);
    expect(rows[0].sourceRecords[0].markdown).toContain("Revision: 1.1");
    expect(rows[0].sourceRecords[1].markdown).toContain("Revision: 1.0");
  });

  it("run 4: a subscriber mail-out is not a revision", async () => {
    advisories = [
      {
        ...SAMPLE,
        version: "1.1",
        enableMail: true,
        lastEmailsSent: "2026-09-09T00:00:00.000+00:00",
      },
      SAMPLE_2,
    ];
    await syncAdvisories(ctx);

    const rows = await readRows();
    show("run 4 - only the mailing fields changed", rows);
    expect(rows[0].sourceRecords).toHaveLength(2);
    expect(rows[1].sourceRecords).toHaveLength(1);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
