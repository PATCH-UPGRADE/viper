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

  it("embeds the platform catalog, so the tool list cannot drift from the prompt", () => {
    expect(SCOUT_SYSTEM_PROMPT).toContain("query_platform_data");
    expect(SCOUT_SYSTEM_PROMPT).toContain("notifications.getMany");
  });
});

describe("buildWriterPrompt — the findings reach the model intact", () => {
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
    expect(prompt).toMatch(/still open and for how long/);
  });
});
