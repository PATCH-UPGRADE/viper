import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/features/integrations/core/types";
import {
  fetchSystemUpdates,
  fetchUpdateCves,
  toRemediationItem,
} from "../feed";

vi.mock("server-only", () => ({}));

const SAMPLE = {
  number: "AX216/26/R",
  title: "Security Vulnerability Patch VA31A_HF04",
  type: "R",
  softwareVersion: "VA31A_HF04",
  statusModel: {
    displayedStatus: "SYSTEM_UPDATES_RUH_UPDATE_FAILED",
    typeStatus: "SYSTEM_UPDATES_RUH_REMOTE_UPDATE",
    flagOpenClose: "O",
    mitigationStatusKey: "MITIGATION_STATUS_FAILED_CANCELLED_ESCALATED",
  },
  instructions: null,
  packageInfo: null,
};

const sessionReturning = (status: number, body: unknown = []): Session => ({
  request: vi.fn(async () => new Response(JSON.stringify(body), { status })),
});

describe("toRemediationItem", () => {
  const item = toRemediationItem(SAMPLE);

  it("keys on the update number", () => {
    expect(item.externalId).toBe("AX216/26/R");
  });

  it("describes it by its title, and the version it installs", () => {
    expect(item.description).toBe("Security Vulnerability Patch VA31A_HF04");
    expect(item.narrative).toBe("Update to VA31A_HF04.");
  });

  it("leaves a typeStatus it does not know unstated", () => {
    expect(
      toRemediationItem({
        ...SAMPLE,
        statusModel: { typeStatus: "SOMETHING_NEW" },
      }).release.category,
    ).toBeNull();
    expect(
      toRemediationItem({ ...SAMPLE, statusModel: null }).release.category,
    ).toBeNull();
  });

  it("falls back to the number when Fleet sends no title", () => {
    expect(toRemediationItem({ ...SAMPLE, title: null }).description).toBe(
      "Fleet system update AX216/26/R",
    );
  });

  it("has no narrative when no version is stated", () => {
    expect(
      toRemediationItem({ ...SAMPLE, softwareVersion: " " }).narrative,
    ).toBeNull();
  });

  it("starts with no devices and no CVEs", () => {
    expect(item.devices).toEqual([]);
    expect(item.cveIds).toEqual([]);
  });
});

describe("fetchSystemUpdates", () => {
  it("asks for one device, with its key encoded", async () => {
    const session = sessionReturning(200, [SAMPLE]);
    await fetchSystemUpdates(session, "US_1067588019");
    expect(session.request).toHaveBeenCalledWith(
      "https://fleet.siemens-healthineers.com/rest/v1/system-updates/ruh/equipment/US_1067588019",
    );
  });

  it("keeps only the fields the sync reads", async () => {
    const updates = await fetchSystemUpdates(
      sessionReturning(200, [SAMPLE]),
      "US_1067588019",
    );
    expect(updates).toEqual([
      {
        number: "AX216/26/R",
        title: "Security Vulnerability Patch VA31A_HF04",

        softwareVersion: "VA31A_HF04",
        statusModel: {
          typeStatus: "SYSTEM_UPDATES_RUH_REMOTE_UPDATE",
        },
      },
    ]);
  });

  it("reads a 404 as no updates", async () => {
    await expect(
      fetchSystemUpdates(sessionReturning(404), "US_1"),
    ).resolves.toEqual([]);
  });

  it("fails on any other error", async () => {
    await expect(
      fetchSystemUpdates(sessionReturning(500), "US_1"),
    ).rejects.toThrow("Fleet system updates for US_1 returned 500");
  });
});

describe("fetchUpdateCves", () => {
  it("asks for one update, with its number encoded", async () => {
    const session = sessionReturning(200, { cves: [] });
    await fetchUpdateCves(session, "AX216/26/R");
    expect(session.request).toHaveBeenCalledWith(
      "https://fleet.siemens-healthineers.com/rest/v1/system-updates/cves?updateNumber=AX216%2F26%2FR",
    );
  });
  it("returns each CVE id once, upper-cased", async () => {
    const session = sessionReturning(200, {
      cves: [
        {
          text: "CVE-2026-0390",
          link: "https://nvd.nist.gov/vuln/detail/CVE-2026-0390",
        },
        { text: "CVE-2026-20806" },
        { text: " cve-2026-0390" },
      ],
    });
    await expect(fetchUpdateCves(session, "AX216/26/R")).resolves.toEqual([
      "CVE-2026-0390",
      "CVE-2026-20806",
    ]);
  });
  it("reads a 404 or no list as no CVEs", async () => {
    await expect(fetchUpdateCves(sessionReturning(404), "X")).resolves.toEqual(
      [],
    );
    await expect(
      fetchUpdateCves(sessionReturning(200, {}), "X"),
    ).resolves.toEqual([]);
  });
});
