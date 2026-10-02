import { createLoader } from "nuqs/server";
import { interruptionsParams, trackingParams } from "../params";

export const trackingParamsLoader = createLoader(trackingParams);

export const interruptionsParamsLoader = createLoader(interruptionsParams);
