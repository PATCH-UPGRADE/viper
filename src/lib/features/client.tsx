"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { FeatureKey, Features } from "@/config/features";

const FeaturesContext = createContext<Features | null>(null);

export function FeaturesProvider({
  features,
  children,
}: {
  features: Features;
  children: ReactNode;
}) {
  return (
    <FeaturesContext.Provider value={features}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures(): Features {
  const features = useContext(FeaturesContext);
  if (!features)
    throw new Error("useFeatures must be used inside <FeaturesProvider>");
  return features;
}

export const useFeature = (key: FeatureKey): boolean => useFeatures()[key];
