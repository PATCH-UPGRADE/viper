// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { DebriefBullet } from "@/features/debrief/types";
import { buildWriterPrompt, SCOUT_SYSTEM_PROMPT } from "./prompts";

/** A fixed scout output, standing in for a real morning's findings. */
const FINDINGS = `- Nephrotek Renastar authentication bypass on two hemodialysis
  machines. vulnerability id: vuln_abc123. KEV listed, exploited elsewhere.
- Eleven Philips IntelliVue MX800 monitors have firmware M.02.07 waiting.
  asset id: asset_def456. No known exploitation.`;

const PREVIOUS: DebriefBullet[] = [
  {
    text: "The {{0}} was still unpatched yesterday.",
    links: [
      {
        label: "Nephrotek flaw",
        entityType: "vulnerability",
        entityId: "vuln_abc123",
      },
    ],
  },
];

const base = {
  findings: FINDINGS,
  departmentName: "Biomedical Engineering",
  departmentDescription: "Maintains and services clinical devices.",
  workOrders: ["WO-101 — replace dialysis line sets"],
  previousBullets: [] as DebriefBullet[],
  previousAgeDays: 1,
};

describe("SCOUT_SYSTEM_PROMPT", () => {
  it("asks for more findings than the brief needs, and does not pre-rank", () => {
    expect(SCOUT_SYSTEM_PROMPT).toMatch(/6 to 10 findings/);
    expect(SCOUT_SYSTEM_PROMPT).toMatch(/Do not rank into a top 3/);
  });

  it("tells the scout that a paraphrased id costs the writer its link", () => {
    // The scout is the only source of ids. If it rewrites one, validate.ts
    // drops the link and the reader gets prose with nothing to click.
    expect(SCOUT_SYSTEM_PROMPT).toMatch(/exactly as it appeared/);
  });

  it("has the scout record findings, not write them as text", () => {
    // Only record_finding calls reach the writer. Prose is discarded.
    expect(SCOUT_SYSTEM_PROMPT).toContain("record_finding");
    expect(SCOUT_SYSTEM_PROMPT).toMatch(/Text you write does not/);
  });

  it("leaves work orders to the platform", () => {
    // The work-order lines are attached from the database, so a lookup by the
    // scout costs tool calls and adds nothing.
    expect(SCOUT_SYSTEM_PROMPT).toMatch(/Do not look up work orders/);
    // Scout prose about tickets contradicted the attached lines.
    expect(SCOUT_SYSTEM_PROMPT).toMatch(
      /Do not describe work orders, tickets, or their status/,
    );
  });

  it("makes the notification the record for an advisory", () => {
    expect(SCOUT_SYSTEM_PROMPT).toMatch(
      /For an inbox advisory, use the\s+notification/,
    );
  });

  it("forbids 'only' or 'all' about the hospital's devices", () => {
    // No tool counts devices by type, so the claim cannot be checked.
    expect(SCOUT_SYSTEM_PROMPT).toMatch(/Never write "only", "all", "every"/);
  });

  it("embeds the platform catalog, so the tool list cannot drift from the prompt", () => {
    expect(SCOUT_SYSTEM_PROMPT).toContain("query_platform_data");
    expect(SCOUT_SYSTEM_PROMPT).toContain("notifications.getMany");
  });
});

describe("buildWriterPrompt — the findings reach the model intact", () => {
  it("tells the writer to trust the attached work-order lines", () => {
    const prompt = buildWriterPrompt(base);

    expect(prompt).toMatch(/come\s+from the database, not from the scout/);
    expect(prompt).toContain('"Work orders: none open"');
  });

  it("forbids 'only' or 'all' about devices, even when the findings say it", () => {
    const prompt = buildWriterPrompt(base);

    expect(prompt).toMatch(/Never write "only", "all", "every"/);
    expect(prompt).toContain("Do not copy such a word from the findings.");
  });

  it("forbids calling one open sub-ticket the last step", () => {
    // A writer that sees one open sub-ticket reads it as the last blocker.
    const prompt = buildWriterPrompt(base);

    expect(prompt).toContain('"the remaining blocker"');
    expect(prompt).toContain('"the last step"');
  });

  it("carries every entity id through verbatim", () => {
    const prompt = buildWriterPrompt(base);

    // The writer can only link to ids it can see.
    expect(prompt).toContain("vuln_abc123");
    expect(prompt).toContain("asset_def456");
  });

  it("includes the department name, description and open work orders", () => {
    const prompt = buildWriterPrompt(base);

    expect(prompt).toContain("Biomedical Engineering");
    expect(prompt).toContain("Maintains and services clinical devices.");
    expect(prompt).toContain("WO-101 — replace dialysis line sets");
  });

  it("tells the writer to link a work order as a workOrder, by exact status", () => {
    const prompt = buildWriterPrompt(base);

    expect(prompt).toMatch(/entityType\s+"workOrder"/);
    expect(prompt).toMatch(/only\s+IN_PROGRESS means work has started/);
  });

  it("says so plainly when a department has no open work orders", () => {
    const prompt = buildWriterPrompt({ ...base, workOrders: [] });

    expect(prompt).toContain("None open.");
  });

  it("handles a missing department description", () => {
    const prompt = buildWriterPrompt({
      ...base,
      departmentDescription: null,
    });

    expect(prompt).toContain("No description recorded.");
  });
});

describe("buildWriterPrompt — bullet count", () => {
  it("states the 3 to 5 range and the hard ceiling", () => {
    const prompt = buildWriterPrompt(base);

    expect(prompt).toMatch(/3 to 5 bullets/);
    expect(prompt).toMatch(/Never more than 5/);
    // A quiet fleet must still produce something rather than fail.
    expect(prompt).toMatch(/Aim for 3 even on a quiet day/);
  });
});

describe("buildWriterPrompt — the placeholder contract", () => {
  // This rule is enforced by schema and repaired by validate.ts. If the prompt
  // stops stating it, the model silently produces drafts that lose their links.
  it("states both directions of the correspondence", () => {
    const prompt = buildWriterPrompt(base);

    expect(prompt).toMatch(/Every marker you write must have a link/);
    expect(prompt).toMatch(/Every link you supply must have a marker/);
  });

  it("explains that the marker is replaced by the label", () => {
    const prompt = buildWriterPrompt(base);

    expect(prompt).toMatch(/replaced by the link's label/);
  });

  it("forbids inventing an entityId and says what happens if it does", () => {
    const prompt = buildWriterPrompt(base);

    expect(prompt).toMatch(/Never invent an entityId/);
    expect(prompt).toMatch(/removed before the reader sees it/);
  });

  it("shows a worked example using the {{0}} form", () => {
    const prompt = buildWriterPrompt(base);

    // Anchored on the example itself. "{{0}}" alone also appears in the rule
    // block above it, so this would pass with the example entirely deleted.
    expect(prompt).toContain("Example of one well-formed bullet");
    expect(prompt).toContain("<id from findings>");
  });
});

describe("buildWriterPrompt — previous debrief", () => {
  it("tells the model this is the first run when there is no history", () => {
    // `since` is null on a department's first ever run, so this is the common
    // case on day one and must not read as an error.
    const prompt = buildWriterPrompt(base);

    expect(prompt).toMatch(/first debrief for this department/);
    expect(prompt).toMatch(/treat everything as new/);
  });

  it("renders yesterday's bullets and asks for follow-through", () => {
    const prompt = buildWriterPrompt({ ...base, previousBullets: PREVIOUS });

    // Rendered with the label substituted. A raw "{{0}}" would tell the model
    // nothing about which vulnerability yesterday's bullet referred to.
    expect(prompt).toContain(
      "The Nephrotek flaw was still unpatched yesterday.",
    );
    expect(prompt).not.toContain("{{0}} was still unpatched");
    expect(prompt).toMatch(/Do not repeat these word for word/);
    expect(prompt).toContain("Yesterday you told this department:");
  });

  it.each([
    [0, "Earlier today you told this department:"],
    [3, "3 days ago you told this department:"],
  ])("labels a run %i days old as %j", (previousAgeDays, label) => {
    // The writer counts "open for how long" from this label, so a same-day
    // regenerate must not read as a day old.
    const prompt = buildWriterPrompt({
      ...base,
      previousBullets: PREVIOUS,
      previousAgeDays,
    });

    expect(prompt).toContain(label);
    expect(prompt).toMatch(/never add a day for each debrief/);
  });
});
