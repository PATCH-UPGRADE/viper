import { useQueryStates } from "nuqs";
import {
  vulnerabilitiesByPriorityParams,
  vulnerabilitiesParams,
} from "../params";

export const useVulnerabilitiesParams = () => {
  return useQueryStates(vulnerabilitiesParams);
};

export const useVulnerabilitiesByPriorityParams = () => {
  return useQueryStates(vulnerabilitiesByPriorityParams);
};
