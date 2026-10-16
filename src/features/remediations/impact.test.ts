import { describe, expect, it } from "vitest";
import {
  type FeatureImpactInput,
  hasStatedImpact,
  IMPACT_FIELDS,
  type ImpactState,
  impactRowsUpdate,
  impactScalarData,
  remediationImpactSchema,
  statedImpactFields,
} from "./impact";

const state = (over: Partial<ImpactState> = {}, impactRows = 0): ImpactState =>
  ({
    ...Object.fromEntries(IMPACT_FIELDS.map((field) => [field, null])),
    _count: { impacts: impactRows },
    ...over,
  }) as ImpactState;

const NURSE_CALL: FeatureImpactInput = {
  phase: "DURING_APPLY",
  feature: "nurse call button",
  effect: "UNAVAILABLE",
};

const BEDSIDE_MONITOR = {
  mechanism: "REMOTE_DEPLOYMENT",
  estimatedDurationSeconds: 1800,
  requiresDowntime: false,
  reversible: true,
  impacts: [NURSE_CALL],
} as const;

describe("remediationImpactSchema", () => {
  it("accepts the bedside monitor golden sample", () => {
    expect(remediationImpactSchema.safeParse(BEDSIDE_MONITOR).success).toBe(
      true,
    );
  });
  it("rejects an unknown mechanism", () => {
    expect(
      remediationImpactSchema.safeParse({ mechanism: "RANDOM_CARRIER" })
        .success,
    ).toBe(false);
  });
  it("rejects a negative duration", () => {
    expect(
      remediationImpactSchema.safeParse({ estimatedDowntimeSeconds: -1 })
        .success,
    ).toBe(false);
  });

  it("rejects a feature row with a blank feture name", () => {
    expect(
      remediationImpactSchema.safeParse({
        impacts: [{ ...NURSE_CALL, feature: "   " }],
      }).success,
    ).toBe(false);
  });
});

describe("impactScalarData", () => {
  it("maps the bedside monitor golden sample to columns", () => {
    expect(impactScalarData(BEDSIDE_MONITOR, "stated")).toEqual({
      mechanism: "REMOTE_DEPLOYMENT",
      estimatedDurationSeconds: 1800,
      requiresDowntime: false,
      reversible: true,
    });
  });
  it("replace: writes an explicit null and skips undefined", () => {
    expect(
      impactScalarData(
        { requiresDowntime: null, restartRequired: true },
        "replace",
      ),
    ).toEqual({
      requiresDowntime: null,
      restartRequired: true,
    });
  });

  it("stated: a null from the source never erases", () => {
    expect(
      impactScalarData(
        { requiresDowntime: null, restartRequired: false },
        "stated",
      ),
    ).toEqual({ restartRequired: false });
  });
  it("stated: writes false, which is an answer", () => {
    expect(impactScalarData({ requiresDowntime: false }, "stated")).toEqual({
      requiresDowntime: false,
    });
  });
  it("fillGaps: never overwrites a stated value", () => {
    expect(
      impactScalarData(
        { requiresDowntime: false },
        "fillGaps",
        state({ requiresDowntime: true }),
      ),
    ).toEqual({});
  });
  it("fillGaps: fills a field that is still null", () => {
    expect(
      impactScalarData(
        { requiresDowntime: true, estimatedDowntimeSeconds: 600 },
        "fillGaps",
        state({
          requiresDowntime: true,
        }),
      ),
    ).toEqual({ estimatedDowntimeSeconds: 600 });
  });
  it("returns nothing for no impact", () => {
    expect(impactScalarData(null, "stated")).toEqual({});
  });
});

describe("impactRowsUpdate", () => {
  it("leaves rows alone when the source sent none", () => {
    expect(impactRowsUpdate(undefined, "replace")).toBeUndefined();
  });
  it("replace: replaces every row", () => {
    expect(impactRowsUpdate([NURSE_CALL], "replace")).toEqual({
      deleteMany: {},
      create: [NURSE_CALL],
    });
  });

  it("replace: an empty array clears the rows", () => {
    expect(impactRowsUpdate([], "replace")).toEqual({
      deleteMany: {},
      create: [],
    });
  });

  it("stated: an empty array leaves the row alone", () => {
    expect(impactRowsUpdate([], "stated")).toBeUndefined();
  });

  it("fillGaps: add rows only when none exist", () => {
    expect(impactRowsUpdate([NURSE_CALL], "fillGaps", state({}, 0))).toEqual({
      deleteMany: {},
      create: [NURSE_CALL],
    });
  });
});

describe("statedImpactFields/hasStatedImpact", () => {
  it("counts false as stated and blank text as not stated", () => {
    expect(
      statedImpactFields({
        requiresDowntime: false,
        verificationNotes: "",
        mechanism: null,
      }),
    ).toEqual(["requiresDowntime"]);
  });
  it("lists impacts when rows exist, from either an array or a count", () => {
    expect(statedImpactFields({ impacts: [NURSE_CALL] })).toEqual(["impacts"]);
    expect(statedImpactFields({ _count: { impacts: 1 } })).toEqual(["impacts"]);
  });
  it("is false when nothing was answered", () => {
    expect(hasStatedImpact({ requiresDowntime: null, impacts: [] })).toBe(
      false,
    );
  });
});
