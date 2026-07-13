import {
  FLEET_LOGIN_CONFIG,
  SessionLoginConfig,
} from "@/lib/teamplay-fleet-session-capture";

export interface VendorAuthConfig {
  usernameEnvVar: string;
  passwordEnvVar: string;
  loginConfig: SessionLoginConfig;
}

export const VENDOR_AUTH_CONFIGS: Record<string, VendorAuthConfig> = {
  "fleet.siemens-healthineers.com": {
    usernameEnvVar: "FLEET_ADVISORY_USERNAME",
    passwordEnvVar: "FLEET_ADVISORY_PASSWORD",
    loginConfig: FLEET_LOGIN_CONFIG,
  },
};

export function getVendorAuthConfig(url: string): VendorAuthConfig | undefined {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  return VENDOR_AUTH_CONFIGS[host];
}
