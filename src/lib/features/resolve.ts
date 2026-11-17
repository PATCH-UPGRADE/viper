import {
  FEATURE_KEYS,
  FEATURE_REQUIRES,
  type FeatureKey,
  type Features,
  NOT_READY,
} from "@/config/features";

/** every flag on */
export const ALL_FEATURES = "all";

/** every flag off */
export const NO_FEATURES = "none";

const isFeatureKey = (name: string): name is FeatureKey =>
  (FEATURE_KEYS as readonly string[]).includes(name);

/** turns a VIPER_FEATURES value into every flag's on/off value */
export function resolveFeatures(raw: string): Features {
  const value = raw.trim();
  if (value === "") {
    throw new Error(`VIPER_FEATURES is empty`);
  }

  let on: FeatureKey[];
  if (value === ALL_FEATURES) {
    on = FEATURE_KEYS.filter((key) => !NOT_READY.includes(key));
  } else if (value === NO_FEATURES) {
    on = [];
  } else {
    const names = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // if all, or none is part of the list, treat as unknown name
    const unknown = names.filter((n) => !isFeatureKey(n));
    if (unknown.length > 0) {
      throw new Error(`VIPER_FEATURES has unknown flag(s)`);
    }
    on = names as FeatureKey[];
  }

  // give every flag a value: on if it's in the list, off otherwise
  const features = {} as Features;
  for (const key of FEATURE_KEYS) {
    features[key] = on.includes(key);
  }

  // check each flag that are on, dependency
  for (const key of FEATURE_KEYS) {
    if (!features[key]) continue;
    if (NOT_READY.includes(key)) {
      throw new Error(`VIPER_FEATURES turns on ${key}`);
    }
    const missing: FeatureKey[] = [];
    for (const dep of FEATURE_REQUIRES[key] ?? []) {
      if (!features[dep]) missing.push(dep);
    }
    if (missing.length > 0) {
      throw new Error(`VIPER_FEATURES: ${key} requires ${missing.join(", ")}`);
    }
  }
  return features;
}
