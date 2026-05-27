"use client";

import { useQueryStates } from "nuqs";
import { trackingParams } from "../params";

export const useTrackingParams = () => {
  return useQueryStates(trackingParams);
};
