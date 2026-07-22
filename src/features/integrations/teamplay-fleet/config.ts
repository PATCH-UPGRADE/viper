import { IntegrationSessionClient } from "../integration-session-client";
import type { SessionLoginConfig } from "./capture";

export const FLEET_LOGIN_CONFIG: SessionLoginConfig = {
  welcomeUrl: "https://fleet.siemens-healthineers.com/welcome", // landing page url
  cookieBannerAcceptSelector:
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll", // first time visiting user will see a cookie banner overlay
  welcomeLoginButtonSelector: '[data-cy="btn-login"]', // landing page login button
  userNameSelector: "#email",
  continueSelector: "#next_link_container",
  passwordSelector: "#password",
  submitSelector: "#btn-login",
  cookieOrigin: "https://fleet.siemens-healthineers.com",
  authUrl: "https://fleet.siemens-healthineers.com/rest/v1/users/self", // user profile endpoint
};

export const FLEET = new IntegrationSessionClient(
  "fleet.siemens-healthineers.com",
  "FLEET_ADVISORY_USERNAME",
  "FLEET_ADVISORY_PASSWORD",
  FLEET_LOGIN_CONFIG,
);
