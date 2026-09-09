// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Session } from "../../../core/types";
import { channelSchema } from "../channels";
import { MedIsaoRequestError, walkPages, withSince } from "../paginate";
import {
  rawRemediationSchema,
  splitVersion,
  toCanonical,
} from "../remediations/feed";

vi.mock("server-only", () => ({}));

const LIVE_REMEDIATION = {
  id: "ee907fce-aa80-419c-b05f-70de3529fb08",
  channel: { vendor: "ViperMD", product: "ViperDevice" },
  advisory_id: "055b56f2-c9c4-4b41-a79c-b18d52fac820",
  version: null,
  version_text: null,
  tlp: "CLEAR",
  category: "mitigation",
  mechanism: "firmware_patch",
  description: "test",
  narrative: "test",
  fixed_vulnerabilities: [],
  requires_downtime: false,
  estimated_downtime_seconds: null,
  restart_required: false,
  disables_features: false,
  workflow_impact: "",
  clinical_impact_notes: "",
  inquiries: 0,
  inquiries_url: "https://example.test/inquiries",
  comments_url: "https://example.test/comments",
  files: [],
  published_at: "2026-08-27T17:21:33.274367Z",
  updated_at: "2026-08-27T17:21:33.274516Z",
};

const sessionOf = (pages: unknown[]): Session => {
  const queue = [...pages];
  return {
    request: vi.fn(async () => {
      const body = queue.shift();
      if (body === undefined) throw new Error("session ran out of pages");
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  };
};

describe("splitVersion", () => {
  it("keeps a plain version out of the range column", () => {
    expect(splitVersion("6.0.2")).toEqual({
      version: "6.0.2",
      versionRange: null,
    });
  });

  it("routes a VERS expression to the range column", () => {
    expect(splitVersion("vers:semver/==6.0.2")).toEqual({
      version: null,
      versionRange: "vers:semver/==6.0.2",
    });
  });

  it("treats a bare wildcard as a range, since it matches every version", () => {
    expect(splitVersion("*")).toEqual({ version: null, versionRange: "*" });
  });

  it("returns neither for an absent or blank version", () => {
    expect(splitVersion(null)).toEqual({ version: null, versionRange: null });
    expect(splitVersion("  ")).toEqual({ version: null, versionRange: null });
  });
});

describe("rawRemediationSchema", () => {
  it("parses the live payload", () => {
    expect(() => rawRemediationSchema.parse(LIVE_REMEDIATION)).not.toThrow();
  });

  it("ignores a field MedISAO adds later", () => {
    const parsed = rawRemediationSchema.parse({
      ...LIVE_REMEDIATION,
      brand_new_field: "surprise",
    });
    expect(parsed.id).toBe(LIVE_REMEDIATION.id);
  });

  it("rejects a payload with no id", () => {
    const { id: _dropped, ...rest } = LIVE_REMEDIATION;
    expect(() => rawRemediationSchema.parse(rest)).toThrow();
  });
});

describe("toCanonical", () => {
  const item = toCanonical(
    rawRemediationSchema.parse(LIVE_REMEDIATION),
    "https://dev.example.test",
    "chan-1",
  );

  it("uses the MedISAO id as the external id", () => {
    expect(item.vendorId).toBe(LIVE_REMEDIATION.id);
  });

  it("takes the device identity from the channel", () => {
    expect(item.manufacturer).toBe("ViperMD");
    expect(item.product).toBe("ViperDevice");
  });

  it("records the channel endpoint, and no human page", () => {
    expect(item.upstreamApi).toBe(
      "https://dev.example.test/api/public/v1/channels/chan-1/remediations",
    );
    expect(item.webUrl).toBeNull();
  });

  it("collects the manufacturer impact fields", () => {
    expect(item.sourceImpact).toEqual({
      category: "mitigation",
      mechanism: "firmware_patch",
      requiresDowntime: false,
      estimatedDowntimeSeconds: null,
      restartRequired: false,
      disablesFeatures: false,
      workflowImpact: "",
      clinicalImpactNotes: "",
    });
  });
});

describe("walkPages", () => {
  it("follows `next` to the end and flattens every page", async () => {
    const session = sessionOf([
      {
        next: "https://x.test/channels?cursor=2",
        previous: null,
        results: [{ id: "a", vendor: "V", product: null, updated_at: "t" }],
      },
      {
        next: null,
        previous: null,
        results: [{ id: "b", vendor: "V", product: null, updated_at: "t" }],
      },
    ]);

    const seen: string[] = [];
    for await (const page of walkPages(
      session,
      "https://x.test/channels",
      channelSchema,
    )) {
      seen.push(...page.map((channel) => channel.id));
    }

    expect(seen).toEqual(["a", "b"]);
    expect(session.request).toHaveBeenCalledTimes(2);
  });

  it("reports the status, so a caller can tell a 404 from a fault", async () => {
    const session: Session = {
      request: vi.fn(async () => new Response("", { status: 404 })),
    };

    const walk = async () => {
      for await (const _page of walkPages(
        session,
        "https://x.test",
        channelSchema,
      )) {
        // drained for the error
      }
    };

    await expect(walk()).rejects.toBeInstanceOf(MedIsaoRequestError);
    await expect(walk()).rejects.toMatchObject({ status: 404 });
  });

  // `next` arrives in a response body and the session signs every request, so
  // following it off-origin would hand the API key to whoever wrote the body.
  it("refuses to follow a next page onto another origin", async () => {
    const session = sessionOf([
      {
        next: "https://attacker.test/steal",
        previous: null,
        results: [{ id: "a", vendor: "V", product: null, updated_at: "t" }],
      },
    ]);

    const walk = async () => {
      for await (const _page of walkPages(
        session,
        "https://x.test/channels",
        channelSchema,
      )) {
        // drained for the error
      }
    };

    await expect(walk()).rejects.toThrow(/Refusing to follow/);
    // The first page was fetched; the attacker's URL never was.
    expect(session.request).toHaveBeenCalledTimes(1);
  });

  it("rejects an envelope with no results array", async () => {
    const session = sessionOf([{ next: null, channels: [] }]);
    const walk = async () => {
      for await (const _page of walkPages(
        session,
        "https://x.test",
        channelSchema,
      )) {
        // drained for the error
      }
    };
    await expect(walk()).rejects.toThrow(/results/);
  });
});

describe("withSince", () => {
  it("adds the watermark as an ISO string", () => {
    expect(
      withSince("https://x.test/a", new Date("2026-01-02T03:04:05Z")),
    ).toBe("https://x.test/a?since=2026-01-02T03%3A04%3A05.000Z");
  });

  it("leaves the url alone on a first run", () => {
    expect(withSince("https://x.test/a", null)).toBe("https://x.test/a");
  });
});
