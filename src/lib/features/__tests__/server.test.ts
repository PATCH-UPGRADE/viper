import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { FEATURE_KEYS, type Features, NOT_READY } from "@/config/features";

vi.mock("server-only", () => ({}));

const { mockNotFound } = vi.hoisted(() => ({
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound: mockNotFound }));

const {
  getDeploymentName,
  getFeatures,
  isEnabled,
  requireFeature,
  resetFeaturesForTest,
} = await import("../server");

function everyImplementedFlagOn(): Features {
  const features = {} as Features;
  for (const key of FEATURE_KEYS) {
    features[key] = !NOT_READY.includes(key);
  }
  return features;
}

function setEnv(env: {
  NODE_ENV?: string;
  NEXT_PHASE?: string;
  VIPER_DEPLOYMENT?: string;
  VIPER_FEATURES?: string;
}) {
  vi.stubEnv("NODE_ENV", env.NODE_ENV ?? "test");
  vi.stubEnv("NEXT_PHASE", env.NEXT_PHASE);
  vi.stubEnv("VIPER_DEPLOYMENT", env.VIPER_DEPLOYMENT);
  vi.stubEnv("VIPER_FEATURES", env.VIPER_FEATURES);
}

let infoSpy: MockInstance<typeof console.info>;

beforeEach(() => {
  resetFeaturesForTest(); // getFeatures() caches per process; every test starts fresh
  mockNotFound.mockClear();
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  infoSpy.mockRestore();
});

describe("getFeatures", () => {
  it("turns every implemented flag on when VIPER_FEATURES is unset outside production", () => {
    setEnv({ NODE_ENV: "test" });
    expect(getFeatures()).toEqual(everyImplementedFlagOn());
  });

  it("uses the list when VIPER_FEATURES is set", () => {
    setEnv({ VIPER_FEATURES: "workflows" });
    expect(isEnabled("workflows")).toBe(true);
    expect(isEnabled("chat")).toBe(false);
  });

  it("refuses to start in production when VIPER_FEATURES is unset", () => {
    setEnv({ NODE_ENV: "production", VIPER_DEPLOYMENT: "pnnl" });
    expect(() => getFeatures()).toThrow(/must be set in production/);
  });

  it("treats an unset value as all during `next build`", () => {
    setEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" });
    expect(getFeatures()).toEqual(everyImplementedFlagOn());
  });

  it("rejects an empty value instead of treating it as unset", () => {
    setEnv({ VIPER_FEATURES: "" });
    expect(() => getFeatures()).toThrow(/is empty/);
  });

  it("keeps the first result until the cache is reset", () => {
    setEnv({ VIPER_FEATURES: "chat" });
    expect(isEnabled("chat")).toBe(true);

    vi.stubEnv("VIPER_FEATURES", "workflows");
    expect(isEnabled("chat")).toBe(true); // still cached
    expect(isEnabled("workflows")).toBe(false);

    resetFeaturesForTest();
    expect(isEnabled("chat")).toBe(false);
    expect(isEnabled("workflows")).toBe(true);
  });

  it("logs the deployment and its flags once per process", () => {
    setEnv({ VIPER_DEPLOYMENT: "pnnl", VIPER_FEATURES: "workflows,chat" });
    getFeatures();
    getFeatures();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith("[features] pnnl: chat, workflows"); // in FEATURE_KEYS order
  });

  it("logs `none` when every flag is off", () => {
    setEnv({ VIPER_FEATURES: "none" });
    getFeatures();
    expect(infoSpy).toHaveBeenCalledWith("[features] local: none");
  });
});

describe("getDeploymentName", () => {
  it("returns the value when set, trimmed", () => {
    setEnv({ VIPER_DEPLOYMENT: "  pnnl  " });
    expect(getDeploymentName()).toBe("pnnl");
  });

  it("falls back to local outside production", () => {
    setEnv({ NODE_ENV: "test" });
    expect(getDeploymentName()).toBe("local");
  });

  it("falls back to local during `next build`", () => {
    setEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" });
    expect(getDeploymentName()).toBe("local");
  });

  it("refuses to start in production when unset", () => {
    setEnv({ NODE_ENV: "production" });
    expect(() => getDeploymentName()).toThrow(
      /VIPER_DEPLOYMENT must be set in production/,
    );
  });
});

describe("requireFeature", () => {
  it("shows the 404 page when the flag is off", () => {
    setEnv({ VIPER_FEATURES: "workflows" });
    expect(() => requireFeature("chat")).toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the flag is on", () => {
    setEnv({ VIPER_FEATURES: "chat" });
    expect(() => requireFeature("chat")).not.toThrow();
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});
