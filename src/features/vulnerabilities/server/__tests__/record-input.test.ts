// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMatchingId: vi.fn(
    async (device: { manufacturer: string; product?: string | null }) =>
      `m-${device.manufacturer}-${device.product ?? "*"}`,
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/router-utils", () => ({
  resolveMatchingId: mocks.resolveMatchingId,
}));

import { recordDataFromInput, recordPatchFromInput } from "../record-input";

const SARIF = { version: "2.1.0", runs: [] };
const devices = [{ manufacturer: "Baxter", product: "Sigma Spectrum" }];

beforeEach(() => vi.clearAllMocks());

describe("recordDataFromInput", () => {
  it("makes a record with a TA3 submission a TA3 record", async () => {
    const data = await recordDataFromInput(
      { devices, ta3Submission: { sarif: SARIF } },
      { userId: "user-1" },
    );
    expect(data.source).toBe("TA3");
    expect(data.userId).toBe("user-1");
  });

  it("makes a record without one an OTHER record", async () => {
    const data = await recordDataFromInput({ devices }, { userId: "user-1" });
    expect(data.source).toBe("OTHER");
  });

  it("rejects a TA3 submission on an OTHER record", async () => {
    await expect(
      recordDataFromInput(
        { source: "OTHER", devices, ta3Submission: { sarif: SARIF } },
        { userId: "user-1" },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a TA3 record without a TA3 submission", async () => {
    await expect(
      recordDataFromInput({ source: "TA3", devices }, { userId: "user-1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("uses a fixed source over the input's", async () => {
    const data = await recordDataFromInput(
      { devices },
      { source: "AI", userId: null },
    );
    expect(data.source).toBe("AI");
    expect(data.userId).toBeNull();
  });

  it("resolves each device to a matching, without CPEs, once per matching", async () => {
    const data = await recordDataFromInput(
      {
        devices: [
          ...devices,
          { manufacturer: "Baxter", product: "Sigma Spectrum" },
          { manufacturer: "BD", versionRange: "vers:semver/<12.3" },
        ],
      },
      { userId: "user-1" },
    );
    expect(mocks.resolveMatchingId).toHaveBeenCalledWith({
      manufacturer: "BD",
      versionRange: "vers:semver/<12.3",
      hasCpe: false,
    });
    expect(data.deviceGroupMatchingIds).toEqual([
      "m-Baxter-Sigma Spectrum",
      "m-BD-*",
    ]);
  });

  it("parses publishedAt", async () => {
    const data = await recordDataFromInput(
      { devices, publishedAt: "2024-05-01T12:00:00Z" },
      { userId: "user-1" },
    );
    expect(data.publishedAt).toEqual(new Date("2024-05-01T12:00:00Z"));
  });
});

describe("recordPatchFromInput", () => {
  it("leaves out what the update doesn't change", async () => {
    const patch = await recordPatchFromInput({ summary: "New summary" });
    expect(patch).toMatchObject({
      summary: "New summary",
      publishedAt: undefined,
      deviceGroupMatchingIds: undefined,
      ta3Submission: undefined,
    });
    expect(mocks.resolveMatchingId).not.toHaveBeenCalled();
  });

  it("clears publishedAt when it is null", async () => {
    const patch = await recordPatchFromInput({ publishedAt: null });
    expect(patch.publishedAt).toBeNull();
  });
});
