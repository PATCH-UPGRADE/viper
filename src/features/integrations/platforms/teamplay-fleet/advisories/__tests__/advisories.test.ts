import { describe, expect, it } from "vitest";
import type { Session } from "@/features/integrations/core/types";
import {
  buildAdvisoryBody,
  externalIdOf,
  hashableOf,
  listChanged,
  parseCveIds,
  toCanonical,
} from "../advisories";

const SAMPLE = {
  id: 25,
  advisoryId: "SSA-016040",
  title: "Insecure Password Encryption Vulnerability in syngo.plaza VB30E",
  cvssScore: 5.3,
  version: "1.0",
  lastUpdated: "2026-02-10T00:00:00.000+00:00",
  tag: null,
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

const ATTACHMENT = {
  name: "260202 Security Advisory 016040.pdf",
  type: "pdf",
  size: "245339",
  languageCode: "EN",
};

describe("externalIdOf", () => {
  it("keys on Fleet's row id, not the printed advisoryId", () => {
    expect(externalIdOf(SAMPLE)).toBe("25");
  });
});

describe("parseCveIds", () => {
  it("splits the delimited string and drops the leading pad", () => {
    expect(parseCveIds(" CVE-2024-52334")).toEqual(["CVE-2024-52334"]);
    expect(parseCveIds(null)).toEqual([]);
  });
});

describe("hashableOf", () => {
  it("strips the mailing fields", () => {
    expect(hashableOf({ ...SAMPLE, enableMail: true })).toEqual(
      hashableOf(SAMPLE),
    );
  });
  it("keeps every that describes the advisory", () => {
    expect(hashableOf({ ...SAMPLE, version: "1.1" })).not.toEqual(
      hashableOf(SAMPLE),
    );
  });
});

describe("buildAdvisoryBody", () => {
  it("carries the CVE, the affected products and the attachment name", () => {
    const body = buildAdvisoryBody({ ...SAMPLE, attachments: [ATTACHMENT] });
    expect(body).toContain("CVE-2024-52334");
    expect(body).toContain("syngo.plaza VB30E");
    expect(body).toContain("All versions < VB30E_HF01");
    expect(body).toContain("Syngo");
    expect(body).toContain("Security Advisory 016040.pdf");
  });
  it("renders the CVSS band, never Fleet's opaque severity code", () => {
    const body = buildAdvisoryBody({ ...SAMPLE, attachments: [ATTACHMENT] });
    expect(body).toContain("CVSS: 5.3 (Medium)");
    expect(body).not.toContain("Severity");
  });
  it("splits productsAffected on its newlines", () => {
    const body = buildAdvisoryBody({ ...SAMPLE, attachments: [ATTACHMENT] });
    expect(body).toContain("- syngo.plaza VB30E");
    expect(body).toContain("- All versions < VB30E_HF01");
  });
});

describe("toCanonical", () => {
  it("keys on the row id and folds attachments into raw, for the hash", () => {
    const item = toCanonical({ ...SAMPLE, attachments: [ATTACHMENT] });
    expect(item.vendorId).toBe("25");
    expect(item.attachments).toEqual([ATTACHMENT]);
    expect(item.raw.attachments).toEqual([ATTACHMENT]);
  });
});

describe("listChanged", () => {
  const sessionOf = (payload: unknown, attachments: unknown = []): Session => ({
    request: async (url: string) =>
      ({
        ok: true,
        json: async () =>
          url.includes("/security-advisories/active") ? payload : attachments,
      }) as unknown as Response,
  });

  it("yields one page, no cursor, with attachments resolved", async () => {
    const pages = [];
    for await (const page of listChanged(sessionOf([SAMPLE]), null)) {
      pages.push(page);
    }

    expect(pages).toHaveLength(1);
    expect(pages[0].items).toHaveLength(1);
    expect(pages[0].cursor).toBeNull();
  });

  it("drops an advisory Fleet has deactived", async () => {
    const body = [SAMPLE, { ...SAMPLE, id: 26, active: false }];
    for await (const page of listChanged(sessionOf(body), null)) {
      expect(page.items.map((a) => a.id)).toEqual([25]);
    }
  });
});
