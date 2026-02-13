import { useQueryStates } from "nuqs";
import {
  vulnerabilitiesBySeverityParams,
  vulnerabilitiesParams,
} from "../params";

export const useVulnerabilitiesParams = () => {
  return useQueryStates(vulnerabilitiesParams);
};

export const useVulnerabilitiesBySeverityParams = () => {
  return useQueryStates(vulnerabilitiesBySeverityParams);
};
