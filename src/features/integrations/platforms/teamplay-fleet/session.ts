import type { Session, SessionInput } from "../../core/types";
import { BASE_URL, type FleetCreds, type SessionLoginConfig } from "./config";
import { fingerprintOf, getCookie, invalidate } from "./cookie-cache";

const MAX_RETRY_ATTEMPT = 2;
const REQUEST_TIMEOUT_MS = 30_000;

export const FLEET_LOGIN_CONFIG: SessionLoginConfig = {
  welcomeUrl: `${BASE_URL}/welcome`, // landing page url
  cookieBannerAcceptSelector:
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll", // first time visiting user will see a cookie banner overlay
  welcomeLoginButtonSelector: '[data-cy="btn-login"]', // landing page login button
  userNameSelector: "#email",
  continueSelector: "#next_link_container",
  passwordSelector: "#password",
  submitSelector: "#btn-login",
  cookieOrigin: BASE_URL,
  authUrl: `${BASE_URL}/rest/v1/users/self`, // user profile endpoint
};

export interface CapturedSession {
  header: "Cookie";
  value: string;
  expiresAt: Date | null;
}

export class FleetAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FleetAuthError";
  }
}

async function launchBrowser() {
  const { chromium } = await import("playwright-core");

  if (!process.env.VERCEL) return chromium.launch();

  const { default: sparticuzChromium } = await import("@sparticuz/chromium");
  return chromium.launch({
    executablePath: await sparticuzChromium.executablePath(),
    args: sparticuzChromium.args,
  });
}

export async function grabSessionCookie(
  config: SessionLoginConfig,
  userName: string,
  password: string,
  { maxAttempt = MAX_RETRY_ATTEMPT }: { maxAttempt?: number } = {},
): Promise<CapturedSession> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempt; attempt++) {
    const browser = await launchBrowser();

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(config.welcomeUrl);

      if (config.cookieBannerAcceptSelector) {
        await page
          .click(config.cookieBannerAcceptSelector, { timeout: 5000 })
          .catch(() => {});
      }

      await page.click(config.welcomeLoginButtonSelector);
      await page.fill(config.userNameSelector, userName);
      await page.click(config.continueSelector);
      await page.fill(config.passwordSelector, password);

      const [authResponse] = await Promise.all([
        page.waitForResponse((res) => res.url().startsWith(config.authUrl)),
        page.click(config.submitSelector),
      ]);

      if (
        authResponse.status() === 401 ||
        authResponse.status() === 403 ||
        !authResponse.ok()
      ) {
        throw new Error(`Fleet rejected credentials`);
      }

      const cookies = await context.cookies(config.cookieOrigin);

      const value = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      const expires = cookies
        .map((c) => c.expires)
        .filter((e): e is number => typeof e === "number" && e > 0);
      const expiresAt =
        expires.length > 0 ? new Date(Math.min(...expires) * 1000) : null;
      return { header: "Cookie", value, expiresAt };
    } catch (err) {
      lastError = err;
    } finally {
      await browser.close();
    }
  }
  throw lastError;
}

function normalizeHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  return headers ? Object.fromEntries(new Headers(headers)) : {};
}

export function createFleetSession({
  integrationId,
  creds,
}: SessionInput<unknown, FleetCreds>): Session {
  const fingerprint = fingerprintOf(creds);
  const login = () =>
    grabSessionCookie(FLEET_LOGIN_CONFIG, creds.username, creds.password);

  const send = (url: string, init: RequestInit, cookie: CapturedSession) =>
    fetch(url, {
      ...init,
      headers: {
        ...normalizeHeaders(init.headers),
        [cookie.header]: cookie.value,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  return {
    async request(url, init = {}) {
      const cookie = await getCookie(integrationId, fingerprint, login);
      const res = await send(url, init, cookie);
      if (res.status !== 401 && res.status !== 403) return res;

      invalidate(integrationId, cookie);
      const fresh = await getCookie(integrationId, fingerprint, login);
      return send(url, init, fresh);
    },
  };
}
