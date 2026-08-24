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

  it("imports nothing that reaches the tRPC appRouter", async () => {
    // This module exists to break an import cycle: router -> event -> handler
    // -> scout -> query_platform_data -> agent-caller -> appRouter. A cycle
    // through appRouter leaves every tRPC procedure undefined at runtime.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/inngest/events/debrief.ts", "utf8"),
    );
    expect(src).not.toMatch(/from "@\/features\/agents/);
    expect(src).not.toMatch(/from "@\/trpc/);
  });
});
