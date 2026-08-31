import { z } from "zod";
import { FLEET_HOST } from "./urls";
import { workOrderConfigSchema } from "./work-orders/config";

export const SIEMENS_HEALTHINEERS = "Siemens Healthineers";
export const BASE_URL = `https://${FLEET_HOST}`;

// Each resource contributes its own settings. Assets need none: their endpoint
// is a constant and their mapping is derived.
export const configSchema = z.object({}).extend(workOrderConfigSchema.shape);
export type FleetConfig = z.infer<typeof configSchema>;

export const credentialSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type FleetCreds = z.infer<typeof credentialSchema>;

export interface SessionLoginConfig {
  welcomeUrl: string;
  cookieBannerAcceptSelector?: string; // there is a cookie setting overlay on the very first login
  welcomeLoginButtonSelector: string;
  userNameSelector: string;
  continueSelector: string;
  passwordSelector: string;
  submitSelector: string;
  cookieOrigin: string;
  authUrl: string;
}
