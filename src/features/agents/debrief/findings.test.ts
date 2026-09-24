// @vitest-environment node
import { AIMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetManyForLlm } = vi.hoisted(() => ({
  mockPrisma: {
    notification: { findMany: vi.fn() },
    vulnerability: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
    workOrderTicket: { findMany: vi.fn(), findUnique: vi.fn() },
    remediation: { findMany: vi.fn() },
  },
  mockGetManyForLlm: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/trpc/agent-caller", () => ({
  createAgentCaller: () => ({
    tracking: { getManyForLlm: mockGetManyForLlm },
  }),
}));

import {
  type EnrichedFinding,
  enrichFindings,
  extractFindings,
  type Finding,
  renderFindings,
  type WorkOrderRow,
} from "./findings";

const workOrder = (overrides: Partial<WorkOrderRow> = {}): WorkOrderRow =>
  ({
    id: "wo_1",
    summary: "Remediate EternalBlue across imaging hosts",
    status: "IN_PROGRESS",
    departments: [{ name: "IT" }, { name: "Radiology" }],
    children: [],
    _count: { assets: 5, children: 0, comments: 1, vulnerabilities: 1 },
    ...overrides,
  }) as WorkOrderRow;

const finding = (overrides: Partial<Finding> = {}): Finding => ({
  entityType: "vulnerability",
  entityId: "v_1",
  summary: "EternalBlue is on five imaging computers.",
  whyItMatters:
    "It is in KEV, and a worm can spread through the imaging chain.",
  ...overrides,
});

const call = (args: unknown, name = "record_finding") =>
  new AIMessage({
    content: "",
    tool_calls: [{ name, args: args as Record<string, unknown>, id: "c" }],
  });

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of Object.values(mockPrisma))
    model.findMany.mockResolvedValue([]);
  mockGetManyForLlm.mockResolvedValue({ items: [], totalCount: 0 });
});

describe("renderFindings", () => {
  // Golden sample: the exact text the writer reads.
  it("renders a finding with related records, work orders, and sub-tickets", () => {
    const enriched: EnrichedFinding = {
      ...finding(),
      label: "CVE-2017-0144",
      related: [
        { entityType: "asset", entityId: "a_1", label: "PACS-CENTRICITY-001" },
      ],
      workOrders: {
        rows: [
          workOrder({
            children: [
              {
                id: "c1",
                summary: "Disable SMBv1 on CT workstation",
                status: "TO_DO",
              },
              {
                id: "c2",
                summary: "Patch PACS server",
                status: "REQUIRES_APPROVAL",
              },
            ],
            _count: { assets: 5, children: 5, comments: 1, vulnerabilities: 1 },
          }),
          workOrder({
            id: "wo_2",
            summary: "Isolate imaging VLAN",
            status: "TO_DO",
            departments: [],
            relation: "sharedVulnerability",
          }),
        ],
        totalCount: 3,
      },
    };

    expect(renderFindings([enriched])).toBe(
      [
        "Finding 1: EternalBlue is on five imaging computers.",
        '- Record: vulnerability v_1 ("CVE-2017-0144")',
        "- Why it matters: It is in KEV, and a worm can spread through the imaging chain.",
        '- Related: asset a_1 ("PACS-CENTRICITY-001")',
        "- Work orders (3):",
        '  - workOrder wo_1 — "Remediate EternalBlue across imaging hosts" — IN_PROGRESS — IT, Radiology',
        '    Open sub-tickets (2 of 5): "Disable SMBv1 on CT workstation" TO_DO; "Patch PACS server" REQUIRES_APPROVAL',
        '  - workOrder wo_2 — "Isolate imaging VLAN" — TO_DO — no department — related work (shares a vulnerability), not filed for this item',
        "  - and 1 more",
      ].join("\n"),
    );
  });

  it("shows a sub-ticket once, under its parent, not also as its own row", () => {
    const child = {
      id: "wo_child",
      summary: "Patch PACS server",
      status: "REQUIRES_APPROVAL" as const,
    };
    const text = renderFindings([
      {
        ...finding(),
        label: null,
        related: [],
        workOrders: {
          rows: [
            workOrder({
              id: "wo_child",
              summary: child.summary,
              status: child.status,
            }),
            workOrder({
              children: [child],
              _count: {
                assets: 5,
                children: 1,
                comments: 0,
                vulnerabilities: 1,
              },
            }),
          ],
          totalCount: 2,
        },
      },
    ]);

    expect(text).not.toContain("workOrder wo_child");
    expect(text).toContain(
      'Open sub-tickets (1 of 1): "Patch PACS server" REQUIRES_APPROVAL',
    );
    expect(text).not.toContain("and 1 more");
  });

  it("says so when no open work order covers a finding", () => {
    const text = renderFindings([
      {
        ...finding(),
        label: null,
        related: [],
        workOrders: { rows: [], totalCount: 0 },
      },
    ]);

    expect(text).toContain("- Record: vulnerability v_1\n");
    expect(text).toContain("- Work orders: none open");
    expect(text).not.toContain("Related:");
  });
});

describe("extractFindings", () => {
  it("reads record_finding calls in order and ignores other tools", () => {
    const found = extractFindings([
      call({ procedure: "assets.getMany" }, "query_platform_data"),
      call(finding({ entityId: "v_1" })),
      call(finding({ entityType: "notification", entityId: "n_1" })),
    ]);

    expect(found.map((f) => f.entityId)).toEqual(["v_1", "n_1"]);
  });

  it("keeps the first finding for a repeated record and skips malformed calls", () => {
    const found = extractFindings([
      call(finding({ summary: "first" })),
      call(finding({ summary: "second" })),
      call({ entityType: "issue", entityId: "i_1" }),
    ]);

    expect(found.map((f) => f.summary)).toEqual(["first"]);
  });
});

describe("enrichFindings", () => {
  it("drops a finding whose record does not exist, and a missing related record", async () => {
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: "v_1", cveId: "CVE-2017-0144" },
    ]);
    mockPrisma.asset.findMany.mockResolvedValue([
      { id: "a_1", hostname: "PACS-CENTRICITY-001" },
    ]);

    const enriched = await enrichFindings([
      finding({
        relatedEntities: [
          { entityType: "asset", entityId: "a_1" },
          { entityType: "asset", entityId: "a_ghost" },
        ],
      }),
      finding({ entityId: "v_ghost" }),
    ]);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].label).toBe("CVE-2017-0144");
    expect(enriched[0].related.map((r) => r.entityId)).toEqual(["a_1"]);
  });

  it("looks up work orders through the router with the finding's own filter", async () => {
    mockPrisma.notification.findMany.mockResolvedValue([
      { id: "n_1", title: "Siemens advisory" },
    ]);
    mockGetManyForLlm.mockResolvedValue({
      items: [workOrder()],
      totalCount: 1,
    });

    const [enriched] = await enrichFindings([
      finding({ entityType: "notification", entityId: "n_1" }),
    ]);

    expect(mockGetManyForLlm).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: "n_1" }),
    );
    expect(enriched.workOrders.rows.map((r) => r.id)).toEqual(["wo_1"]);
  });

  it("shows a work-order finding as its own work order", async () => {
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      { id: "wo_1", summary: "x" },
    ]);
    mockPrisma.workOrderTicket.findUnique.mockResolvedValue(workOrder());

    const [enriched] = await enrichFindings([
      finding({ entityType: "workOrder", entityId: "wo_1" }),
    ]);

    expect(mockGetManyForLlm).not.toHaveBeenCalled();
    expect(enriched.workOrders).toEqual({ rows: [workOrder()], totalCount: 1 });
  });

  it("queries each entity type once, batched", async () => {
    await enrichFindings([
      finding({
        entityId: "v_1",
        relatedEntities: [{ entityType: "vulnerability", entityId: "v_2" }],
      }),
      finding({ entityId: "v_3" }),
    ]);

    expect(mockPrisma.vulnerability.findMany).toHaveBeenCalledTimes(1);
    const [{ where }] = mockPrisma.vulnerability.findMany.mock.calls[0];
    expect([...where.id.in].sort()).toEqual(["v_1", "v_2", "v_3"]);
  });
});
