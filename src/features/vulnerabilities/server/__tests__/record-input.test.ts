// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  devicesToMatchingConnect: vi.fn(
    async (devices: { manufacturer: { name: string } }[]) =>
      devices.map((device) => ({ id: `m-${device.manufacturer.name}` })),
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/router-utils", () => ({
  devicesToMatchingConnect: mocks.devicesToMatchingConnect,
}));

import { recordDataFromInput, recordPatchFromInput } from "../record-input";

const SARIF = { version: "2.1.0", runs: [] };
const devices = [
  {
    manufacturer: { name: "Baxter" },
    product: { name: "Sigma Spectrum" },
    version: { range: "vers:all/*" },
  },
];

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

  it("resolves the devices to matchings", async () => {
    const data = await recordDataFromInput({ devices }, { userId: "user-1" });
    expect(mocks.devicesToMatchingConnect).toHaveBeenCalledWith(devices);
    expect(data.deviceGroupMatchingIds).toEqual(["m-Baxter"]);
  });

  it("keeps the source's own ID for the statement", async () => {
    const data = await recordDataFromInput(
      { devices, sourceId: "GHSA-jfh8-c2jp-5v3q" },
      { userId: "user-1" },
    );
    expect(data.sourceId).toBe("GHSA-jfh8-c2jp-5v3q");
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
    expect(mocks.devicesToMatchingConnect).not.toHaveBeenCalled();
  });

  it("clears publishedAt when it is null", async () => {
    const patch = await recordPatchFromInput({ publishedAt: null });
    expect(patch.publishedAt).toBeNull();
  });
});
