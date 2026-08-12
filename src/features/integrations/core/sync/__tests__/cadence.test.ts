// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { INTEGRATION_SYNC_EVERY_MIN } from "@/config/constants";
import { computeNextSyncAt, effectiveSyncEvery } from "../index";

/**
 * Cadence and backoff decide how often every integration in the system
 * runs, and how long a broken one stays quiet.
 */

afterEach(() => vi.restoreAllMocks());

describe("effectiveSyncEvery", () => {
  it("prefers the operator's per-resource override", () => {
    expect(effectiveSyncEvery(60, 300, 900)).toBe(60);
  });

  it("falls back to the instance-wide override", () => {
    expect(effectiveSyncEvery(null, 300, 900)).toBe(300);
  });

  it("then to the platform author's own cadence for the resource", () => {
    expect(effectiveSyncEvery(null, null, 900)).toBe(900);
  });

  it("and finally to the global floor", () => {
    expect(effectiveSyncEvery(null, null, null)).toBe(
      INTEGRATION_SYNC_EVERY_MIN * 60,
    );
  });
});

describe("computeNextSyncAt", () => {
  const withRandom = (value: number) =>
    vi.spyOn(Math, "random").mockReturnValue(value);

  const secondsFromNow = (date: Date) => (date.getTime() - Date.now()) / 1000;

  it("doubles the interval per consecutive failure", () => {
    withRandom(0.5); // jitter factor 1.0
    expect(secondsFromNow(computeNextSyncAt(300, 0))).toBeCloseTo(300, 0);
    expect(secondsFromNow(computeNextSyncAt(300, 1))).toBeCloseTo(600, 0);
    expect(secondsFromNow(computeNextSyncAt(300, 3))).toBeCloseTo(2400, 0);
  });

  it("stops doubling after six failures", () => {
    withRandom(0.5);
    const atSix = secondsFromNow(computeNextSyncAt(60, 6));
    const atTwenty = secondsFromNow(computeNextSyncAt(60, 20));
    expect(atSix).toBeCloseTo(60 * 64, 0);
    expect(atTwenty).toBeCloseTo(atSix, 0);
  });

  it("caps the wait at 24 hours", () => {
    withRandom(0.5);
    expect(secondsFromNow(computeNextSyncAt(86_400, 6))).toBeCloseTo(86_400, 0);
  });

  it("jitters within ±10% so instances don't fall into lockstep", () => {
    withRandom(0);
    expect(secondsFromNow(computeNextSyncAt(1000, 0))).toBeCloseTo(900, 0);

    withRandom(0.999999);
    expect(secondsFromNow(computeNextSyncAt(1000, 0))).toBeCloseTo(1100, 0);
  });
});
