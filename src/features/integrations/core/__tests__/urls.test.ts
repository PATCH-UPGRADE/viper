// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { UrlBuilders } from "../types";
import {
  resolveUpstreamApi,
  resolveWebUrl,
  type UrlBearingMapping,
} from "../urls";

/**
 * Two client components render links through these. The no-builders path has to
 * keep behaving exactly as the old `src/lib/upstream-urls.ts` did, or every
 * vulnerability link changes without anyone touching a component.
 */

const mapping = (
  overrides: Partial<UrlBearingMapping> = {},
): UrlBearingMapping => ({
  externalId: "EXT-1",
  upstreamApi: null,
  webUrl: null,
  ...overrides,
});

const API = "https://api.example.com/v1/things/EXT-1";
const WEB = "https://example.com/things/EXT-1";

describe("without a platform module (ai / partner)", () => {
  it("uses the stored API url", () => {
    expect(resolveUpstreamApi([mapping({ upstreamApi: API })])).toBe(API);
  });

  it("prefers a real web url for humans", () => {
    expect(resolveWebUrl([mapping({ upstreamApi: API, webUrl: WEB })])).toBe(
      WEB,
    );
  });

  it("falls back to the API url when no web url was supplied", () => {
    expect(resolveWebUrl([mapping({ upstreamApi: API })])).toBe(API);
  });

  it("resolves nothing when nothing was stored", () => {
    expect(resolveUpstreamApi([mapping()])).toBeNull();
    expect(resolveWebUrl([mapping()])).toBeNull();
    expect(resolveWebUrl(undefined)).toBeNull();
    expect(resolveWebUrl([])).toBeNull();
  });

  it("takes the first mapping that actually carries a url", () => {
    expect(resolveUpstreamApi([mapping(), mapping({ upstreamApi: API })])).toBe(
      API,
    );
  });
});

describe("with a platform module (code-defined platforms)", () => {
  const builders: UrlBuilders<{ base: string }> = {
    apiUrlFor: (externalId, config) => `${config.base}/api/${externalId}`,
    webUrlFor: (externalId, config) => `${config.base}/ui/${externalId}`,
  };
  const config = { base: "https://fleet.example.com" };

  it("derives urls in preference to stored ones", () => {
    const mappings = [mapping({ upstreamApi: API, webUrl: WEB })];

    expect(resolveUpstreamApi(mappings, builders, config)).toBe(
      "https://fleet.example.com/api/EXT-1",
    );
    expect(resolveWebUrl(mappings, builders, config)).toBe(
      "https://fleet.example.com/ui/EXT-1",
    );
  });

  it("falls back to the stored url when the builder declines", () => {
    const declining: UrlBuilders<{ base: string }> = {
      apiUrlFor: () => null,
      webUrlFor: () => null,
    };
    const mappings = [mapping({ upstreamApi: API, webUrl: WEB })];

    expect(resolveUpstreamApi(mappings, declining, config)).toBe(API);
    expect(resolveWebUrl(mappings, declining, config)).toBe(WEB);
  });

  it("skips a mapping with no externalId to build from", () => {
    const mappings = [
      mapping({ externalId: undefined, upstreamApi: API }),
      mapping({ externalId: "EXT-2" }),
    ];

    expect(resolveUpstreamApi(mappings, builders, config)).toBe(
      "https://fleet.example.com/api/EXT-2",
    );
  });

  it("ignores builders when there is no config to build with", () => {
    expect(
      resolveUpstreamApi([mapping({ upstreamApi: API })], builders, undefined),
    ).toBe(API);
  });
});
