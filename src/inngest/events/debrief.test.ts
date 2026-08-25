// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock("../client", () => ({ inngest: { send: mockSend } }));

import { requestDebrief } from "./debrief";

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue(undefined);
});

describe("requestDebrief", () => {
  it("keys the event on the row id, so one claimed run runs once", async () => {
    await expect(requestDebrief("run-1", "d1", "findings")).resolves.toBe(true);

    expect(mockSend).toHaveBeenCalledWith({
      name: "debrief/generate.requested",
      data: {
        debriefId: "run-1",
        departmentId: "d1",
        findings: "findings",
        key: "run-1",
      },
    });
  });

  it("reports failure instead of throwing into the caller's mutation", async () => {
    // regenerate has already written its Generating row by this point; a throw
    // here would surface as a failed mutation with the row left behind.
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSend.mockRejectedValue(new Error("inngest down"));

    await expect(requestDebrief("run-1", "d1")).resolves.toBe(false);
  });

  it("declares no import that reaches the tRPC appRouter", async () => {
    // This module exists to break an import cycle: router -> event -> handler
    // -> scout -> query_platform_data -> agent-caller -> appRouter. A cycle
    // through appRouter leaves every tRPC procedure undefined at runtime, and
    // the whole API returns 500.
    //
    // Scope: DIRECT imports only. A transitive reintroduction through a helper
    // would pass here, so this is a guard rail, not a proof — a real check
    // needs graph analysis in the lint step.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    // Resolved against this file, not the process cwd, so the test does not
    // depend on where the runner was launched.
    const here = fileURLToPath(new URL("./debrief.ts", import.meta.url));

    const src = readFileSync(here, "utf8");
    const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);

    expect(imports).not.toContain(
      expect.stringMatching(/@\/features\/agents|@\/trpc/),
    );
    for (const spec of imports) {
      expect(spec).not.toMatch(/@\/features\/agents|@\/trpc/);
    }
  });
});
