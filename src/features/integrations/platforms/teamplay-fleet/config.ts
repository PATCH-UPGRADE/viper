import { z } from "zod";
import { AuthType } from "@/generated/prisma";
import { basicAuthSchema } from "@/lib/schemas";
import { FLEET_HOST } from "./urls";

export const SIEMENS_HEALTHINEERS = "Siemens Healthineers";
export const BASE_URL = `https://${FLEET_HOST}`;

export const configSchema = z.object({});
export type FleetConfig = z.infer<typeof configSchema>;

export const credentialSchema = z.object({
  authType: z.literal(AuthType.Basic),
  authentication: basicAuthSchema,
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
