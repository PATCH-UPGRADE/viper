import { createLoader } from "nuqs/server";
import {
  vulnerabilitiesByPriorityParams,
  vulnerabilitiesParams,
} from "../params";

export const vulnerabilitiesParamsLoader = createLoader(vulnerabilitiesParams);

export const vulnerabilitiesByPriorityParamsLoader = createLoader(
  vulnerabilitiesByPriorityParams,
);
