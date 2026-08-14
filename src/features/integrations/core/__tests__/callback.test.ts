// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockCreateUserToken } = vi.hoisted(() => ({
  mockCreateUserToken: vi.fn(async () => "raw-token"),
}));

vi.mock("@/lib/tokens", () => ({
  createUserToken: mockCreateUserToken,
  DEFAULT_TOKEN_TTL_SECONDS: 900,
}));
vi.mock("@/lib/db", () => ({ default: {} }));

import { ResourceType } from "@/generated/prisma";
import { createCallback } from "../callback";

/**
 * These paths are a contract with every partner and with the committed n8n
 * workflow. Changing one silently breaks an integration we can't see.
 */

beforeEach(() => vi.clearAllMocks());

describe("createCallback", () => {
  it.each([
    [ResourceType.Asset, "/assets/integrationUpload/raw-token"],
    [
      ResourceType.DeviceArtifact,
      "/deviceArtifacts/integrationUpload/raw-token",
    ],
    [ResourceType.Remediation, "/remediations/integrationUpload/raw-token"],
    [
      ResourceType.Vulnerability,
      "/vulnerabilities/integrationUpload/raw-token",
    ],
    [ResourceType.WorkOrder, "/workOrders/integrationUpload/raw-token"],
  ])("routes %s to %s", async (resource, path) => {
    const callback = await createCallback("shadow-user", resource);
    expect(callback.path).toBe(path);
  });

  it("refuses SourceRecord, which has no upload endpoint", async () => {
    await expect(
      createCallback("shadow-user", ResourceType.SourceRecord),
    ).rejects.toThrow(/Unhandled ResourceType/);
  });

  it("scopes a single-use token to the shadow user and the resource", async () => {
    await createCallback("shadow-user", ResourceType.Asset);

    expect(mockCreateUserToken).toHaveBeenCalledWith(
      "shadow-user",
      900,
      ResourceType.Asset,
    );
  });

  it("composes url from baseApiUrl and path", async () => {
    const callback = await createCallback("shadow-user", ResourceType.Asset);

    expect(callback.baseApiUrl).toMatch(/\/api\/v1$/);
    expect(callback.url).toBe(`${callback.baseApiUrl}${callback.path}`);
  });

  it("describes the envelope the platform must send back", async () => {
    const callback = await createCallback("shadow-user", ResourceType.Asset);

    // n8n reads this straight into its output parser, so it has to be a real
    // JSON Schema of the upload envelope, not just any object.
    expect(callback.schema).toMatchObject({ type: "object" });
    expect(JSON.stringify(callback.schema)).toContain("vendorId");
  });
});
