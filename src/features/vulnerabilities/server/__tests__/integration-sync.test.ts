// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processIntegrationSync: vi.fn(),
  cpesToMatchingConnect: vi.fn(async () => [{ id: "m-1" }]),
  findIdentifier: vi.fn(async (): Promise<{ id: string } | null> => null),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  default: {
    vulnerability: {},
    externalVulnerabilityMapping: {},
    vulnerabilityIdentifier: { findUnique: mocks.findIdentifier },
  },
}));
vi.mock("@/features/integrations/core/sync/upsert", () => ({
  processIntegrationSync: mocks.processIntegrationSync,
}));
vi.mock("@/lib/router-utils", () => ({
  cpesToMatchingConnect: mocks.cpesToMatchingConnect,
}));

import { processVulnerabilityIntegrationSync } from "../integration-sync";

const CPE = "cpe:2.3:h:philips:intellivue_mx800:*:*:*:*:*:*:*:*";

async function transform(item: Record<string, unknown>) {
  await processVulnerabilityIntegrationSync({ items: [] }, "shadow-1", "int-1");
  const config = mocks.processIntegrationSync.mock.calls[0][1];
  return config.transformInputItem(item, "shadow-1");
}

beforeEach(() => vi.clearAllMocks());

describe("processVulnerabilityIntegrationSync", () => {
  // Vulnerability.sarif is a required Json column.
  it("creates a vulnerability with {} when the source gives no SARIF", async () => {
    const { createData } = await transform({ externalId: "v-1", cpes: [CPE] });
    expect(createData.sarif).toEqual({});
  });

  it("leaves stored SARIF alone on update when the source gives none", async () => {
    const { updateData } = await transform({ externalId: "v-1", cpes: [CPE] });
    expect(updateData.sarif).toBeUndefined();
  });

  it("keeps SARIF that the source gives", async () => {
    const sarif = { version: "2.1.0", runs: [] };
    const { createData, updateData } = await transform({
      externalId: "v-1",
      cpes: [CPE],
      sarif,
    });
    expect(createData.sarif).toBe(sarif);
    expect(updateData.sarif).toBe(sarif);
  });

  it("creates the vulnerability with its CVE as an identifier", async () => {
    const { createData } = await transform({
      externalId: "v-1",
      cpes: [CPE],
      cveId: "cve-2024-0001",
    });
    expect(createData.displayId).toBe("CVE-2024-0001");
    expect(createData.identifiers).toEqual({
      create: { value: "CVE-2024-0001", displayValue: "CVE-2024-0001" },
    });
  });

  it("gives a vulnerability with no CVE a VIPER identifier", async () => {
    const { createData } = await transform({ externalId: "v-1", cpes: [CPE] });
    expect(createData.displayId).toMatch(/^VIPER-[0-9A-F]{12}$/);
    expect(createData.identifiers.create.value).toBe(createData.displayId);
  });

  it("leaves out an identifier another vulnerability already holds", async () => {
    mocks.findIdentifier.mockResolvedValueOnce({ id: "ident-1" });
    const { createData } = await transform({
      externalId: "v-1",
      cpes: [CPE],
      cveId: "CVE-2024-0001",
    });
    expect(createData.displayId).toBe("CVE-2024-0001");
    expect(createData.identifiers).toBeUndefined();
  });
});
