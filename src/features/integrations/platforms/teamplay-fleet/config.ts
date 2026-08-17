import { z } from "zod";
import { authCredentialSchema } from "@/features/integrations/core/credentials";
import { AuthType } from "@/generated/prisma";
import { basicAuthSchema } from "@/lib/schemas";
import { FLEET_HOST } from "./urls";

export const SIEMENS_HEALTHINEERS = "Siemens Healthineers";
export const BASE_URL = `https://${FLEET_HOST}`;

export const configSchema = z.object({});
export type FleetConfig = z.infer<typeof configSchema>;

export const credentialSchema = authCredentialSchema;
export type FleetCreds = z.infer<typeof credentialSchema>;
export type FleetLogin = z.infer<typeof basicAuthSchema>;

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

export function loginCredentials(creds: FleetCreds) {
  if (creds.authType !== AuthType.Basic) {
    throw new Error(`Teamplay Fleet login error`);
  }
  const parsed = basicAuthSchema.safeParse(creds.authentication);
  if (!parsed.success) {
    throw new Error(`Teamplay Fleet credentials missing`);
  }
  return parsed.data;
}
