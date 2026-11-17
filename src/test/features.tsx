import type { ReactNode } from "react";
import { FEATURE_KEYS, type Features, NOT_READY } from "@/config/features";
import { FeaturesProvider } from "@/lib/features/client";

export const allFeatures = (overrides: Partial<Features> = {}): Features => {
  const features = {} as Features;
  for (const key of FEATURE_KEYS) {
    features[key] = !NOT_READY.includes(key);
  }
  return { ...features, ...overrides };
};

export const withFeatures =
  (overrides: Partial<Features> = {}) =>
  ({ children }: { children: ReactNode }) => (
    <FeaturesProvider features={allFeatures(overrides)}>
      {children}
    </FeaturesProvider>
  );
