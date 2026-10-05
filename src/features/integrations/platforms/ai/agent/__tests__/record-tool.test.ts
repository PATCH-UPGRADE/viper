// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { ResourceType } from "@/generated/prisma";
import { makeRecorder } from "../record-tool";
import { CRAWLER_ITEM_SCHEMAS, type CrawlerResource } from "../schemas";

const assetSchema = CRAWLER_ITEM_SCHEMAS[ResourceType.Asset];

describe("record_items", () => {
  it("keeps items across calls", async () => {
    const recorder = makeRecorder(assetSchema);
    await recorder.recordTool.invoke({
      items: [{ externalId: "a", ip: "10.0.0.1" }],
    });
    await recorder.recordTool.invoke({
      items: [{ externalId: "b", ip: "10.0.0.2" }],
    });

    const { called, items } = recorder.recorded();
    expect(called).toBe(true);
    expect(items.map((i) => i.externalId)).toEqual(["a", "b"]);
  });

  it("keeps the last version of a repeated externalId", async () => {
    const recorder = makeRecorder(assetSchema);
    await recorder.recordTool.invoke({
      items: [{ externalId: "a", ip: "10.0.0.1" }],
    });
    await recorder.recordTool.invoke({
      items: [{ externalId: "a", ip: "10.0.0.9" }],
    });

    expect(recorder.recorded().items).toEqual([
      { externalId: "a", ip: "10.0.0.9" },
    ]);
  });

  it("keeps nothing from a rejected call, so a resent page is saved once", async () => {
    const recorder = makeRecorder(assetSchema);
    await expect(
      recorder.recordTool.invoke({
        items: [
          { externalId: "a#1", ip: "10.0.0.1" },
          { externalId: "b#1", ip: "10.0.0.2", cpe: "philips monitor" },
        ],
      }),
    ).rejects.toThrow();
    await recorder.recordTool.invoke({
      items: [
        { externalId: "a:1", ip: "10.0.0.1" },
        { externalId: "b:1", ip: "10.0.0.2" },
      ],
    });

    expect(recorder.recorded().items.map((i) => i.externalId)).toEqual([
      "a:1",
      "b:1",
    ]);
  });

  it("keeps the reason when the model reports no stable id", async () => {
    const recorder = makeRecorder(assetSchema);
    await recorder.reportTool.invoke({ reason: "Rows have no id field." });
    expect(recorder.recorded().noStableId).toBe("Rows have no id field.");
  });

  it("tells an empty recording apart from no accepted recording", async () => {
    const empty = makeRecorder(assetSchema);
    await empty.recordTool.invoke({ items: [] });
    expect(empty.recorded()).toEqual({ called: true, items: [] });

    const rejectedOnly = makeRecorder(assetSchema);
    await expect(
      rejectedOnly.recordTool.invoke({ items: [{ externalId: "a" }] }),
    ).rejects.toThrow();
    expect(rejectedOnly.recorded()).toEqual({ called: false, items: [] });
  });
});

/** Golden samples: one realistic item per resource, as the crawler records it. */
const GOLDEN: Record<CrawlerResource, unknown> = {
  [ResourceType.Asset]: {
    externalId: "dev-1001",
    ip: "10.12.4.21",
    hostname: "icu-mon-04",
    macAddress: "00:1B:44:11:3A:B7",
    serialNumber: "SN-44821",
    cpe: "cpe:2.3:h:philips:intellivue_mx800:*:*:*:*:*:*:*:*",
    role: "Patient monitor",
    location: { building: "Main", floor: "3", room: "ICU-4" },
    status: "Active",
    upstreamApi: "https://nvgd.example.com/api/devices/dev-1001",
  },
  [ResourceType.Vulnerability]: {
    externalId: "vuln-77",
    cveId: "CVE-2024-12345",
    cpes: ["cpe:2.3:a:baxter:sigma_spectrum:8.00.01:*:*:*:*:*:*:*"],
    description: "Hard-coded credentials in the pump web service.",
    severity: "High",
    cvssScore: 8.1,
    cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
  },
  [ResourceType.Remediation]: {
    externalId: "rem-12",
    description: "Update pump firmware to 8.02.",
    narrative: "Apply the vendor patch during the maintenance window.",
    cpes: ["cpe:2.3:a:baxter:sigma_spectrum:8.00.01:*:*:*:*:*:*:*"],
    artifacts: [
      {
        name: "sigma-8.02.bin",
        artifactType: "Firmware",
        downloadUrl: "https://vendor.example.com/files/sigma-8.02.bin",
      },
    ],
  },
  [ResourceType.DeviceArtifact]: {
    externalId: "art-3",
    cpe: "cpe:2.3:h:philips:intellivue_mx800:*:*:*:*:*:*:*:*",
    role: "Patient monitor",
    description: "Service manual for the MX800.",
    artifacts: [{ name: "mx800-manual.pdf", artifactType: "Documentation" }],
  },
};

describe("crawler item schemas", () => {
  it.each(Object.entries(CRAWLER_ITEM_SCHEMAS))(
    "%s accepts its golden sample",
    (resource, schema) => {
      const result = schema.safeParse(GOLDEN[resource as CrawlerResource]);
      expect(result.error).toBeUndefined();
    },
  );

  it.each(Object.entries(CRAWLER_ITEM_SCHEMAS))(
    "%s converts to a JSON Schema for the tool definition",
    (_, schema) => {
      expect(z.toJSONSchema(schema, { io: "input" })).toMatchObject({
        type: "object",
      });
    },
  );

  it("leaves out fields that hold VIPER ids", () => {
    const vuln = CRAWLER_ITEM_SCHEMAS[ResourceType.Vulnerability].shape;
    const rem = CRAWLER_ITEM_SCHEMAS[ResourceType.Remediation].shape;
    expect(vuln).not.toHaveProperty("deviceArtifactId");
    expect(rem).not.toHaveProperty("vulnerabilityIds");
  });
});
