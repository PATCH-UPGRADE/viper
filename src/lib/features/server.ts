import "server-only";
import { notFound } from "next/navigation";
import {
  FEATURE_KEYS,
  type FeatureKey,
  type Features,
} from "@/config/features";
import { ALL_FEATURES, resolveFeatures } from "./resolve";

const isBuild = () => process.env.NEXT_PHASE === "phase-production-build";

const isDevOrTest = () => process.env.NODE_ENV !== "production";

// the name for each deployment, also can use it for Sentry logs
export function getDeploymentName(): string {
  const name = process.env.VIPER_DEPLOYMENT?.trim();
  if (name) return name;
  if (isBuild() || isDevOrTest()) return "local";
  throw new Error("VIPER_DEPLOYMENT must be set in production");
}

function getFeatureList(): string {
  const raw = process.env.VIPER_FEATURES;
  if (raw !== undefined) return raw;
  if (isBuild() || isDevOrTest()) return ALL_FEATURES;
  throw new Error(`VIPER_FEATURES must be set in production`);
}

// app level cache: when the app starts and reused until it restarts
let cached: Features | undefined;

export function getFeatures(): Features {
  if (!cached) {
    const features = resolveFeatures(getFeatureList());
    const on = FEATURE_KEYS.filter((key) => features[key]);
    console.info(`[features] ${getDeploymentName()}: ${on.join(", ")}`);
    cached = features;
  }
  return cached;
}

export const isEnabled = (key: FeatureKey): boolean => getFeatures()[key];

/** use for server pages and layouts, a disable feature's page is a 404 */
export function requireFeature(key: FeatureKey): void {
    if(!isEnabled(key)) notFound();
};

// for tests only: forget the cached flags
export function resetFeaturesForTest(): void {
    cached = undefined;
}