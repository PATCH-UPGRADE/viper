import { createLoader } from "nuqs/server";
import { vulnerabilitiesParams } from "../params";

export const vulnerabilitiesParamsLoader = createLoader(vulnerabilitiesParams);

export const vulnerabilityIntegrationsParamsLoader = createLoader(vulnerabilitiesParams);
