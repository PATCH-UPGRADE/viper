"use client";

import { useQueryStates } from "nuqs";
import { advisoriesParams } from "../params";

export const useAdvisoriesParams = () => {
  return useQueryStates(advisoriesParams);
};
