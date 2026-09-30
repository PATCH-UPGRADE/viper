// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

import { PlatformEnum } from "@/generated/prisma";
import { catalogEntries } from "../catalog";

const aiConfigFields = () =>
  catalogEntries().find((entry) => entry.platform === PlatformEnum.AI)
    ?.configFields ?? [];

describe("catalog field kinds", () => {
  it("gives AI crawler instructions a free-form textarea", () => {
    expect(
      aiConfigFields().find((field) => field.key === "additionalInstructions"),
    ).toEqual({
      key: "additionalInstructions",
      kind: "textarea",
      required: false,
    });
  });

  it("keeps the integration URI a url field", () => {
    expect(
      aiConfigFields().find((field) => field.key === "integrationUri"),
    ).toMatchObject({ kind: "url", required: true });
  });
});
