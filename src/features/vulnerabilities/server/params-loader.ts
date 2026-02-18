import { createLoader } from "nuqs/server";
import {
  vulnerabilitiesBySeverityParams,
  vulnerabilitiesParams,
} from "../params";

export const vulnerabilitiesParamsLoader = createLoader(vulnerabilitiesParams);

export const vulnerabilitiesBySeverityParamsLoader = createLoader(
  vulnerabilitiesBySeverityParams,
);
