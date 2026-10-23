import { describe, expect, it, vi } from "vitest";
import type { FleetAdvisory } from "../../advisories/advisories";
import { toRemediationItem } from "../feed";

vi.mock("server-only", () => ({}));

const SAMPLE: FleetAdvisory = {
  id: 25,
  advisoryId: "SSA-016040",
  title: "Insecure Password Encryption Vulnerability in syngo.plaza VB30E",
  cvssScore: 5.3,
  version: "1.0",
  lastUpdated: "2026-02-10T00:00:00.000+00:00",
  modality: ["Syngo"],
  cveIds: " CVE-2024-52334",
  productsAffected:
    "syngo.plaza VB30E\nAll versions < VB30E_HF01\naffected by CVE-2024-52334",
  activationDate: "2026-02-10T00:00:00.000+00:00",
  active: true,
  severity: "2",
  lastEmailsSent: null,
  enableMail: false,
};

describe("toRemediationItem", () => {
  const item = toRemediationItem(SAMPLE);

  it("keys on Fleet's advisory row id", () => {
    expect(item.externalId).toBe("25");
  });

  it("describes it by its advisory label and title", () => {
    expect(item.description).toBe(
      "SSA-016040: Insecure Password Encryption Vulnerability in syngo.plaza VB30E",
    );
  });

  it("states the fixed version per product", () => {
    expect(item.narrative).toBe(
      "Update syngo.plaza VB30E to VB30E_HF01 or later.",
    );
  });

  it("names the CVEs it fixes, trimmed", () => {
    expect(item.cveIds).toEqual(["CVE-2024-52334"]);
  });

  it("is a security software update, released on its activation date", () => {
    expect(item.release).toEqual({
      category: "SOFTWARE_UPDATE",
      isSecurityUpdate: true,
      publishedAt: "2026-02-10T00:00:00.000Z",
    });
  });

  it("falls back to a title when Fleet sends no label", () => {
    expect(toRemediationItem({ ...SAMPLE, advisoryId: null }).description).toBe(
      "Insecure Password Encryption Vulnerability in syngo.plaza VB30E",
    );
  });

  it("has no narrative when no fixed version is stated", () => {
    expect(
      toRemediationItem({
        ...SAMPLE,
        productsAffected: "syngo.via\nAll versions",
      }).narrative,
    ).toBeNull();
  });
});
