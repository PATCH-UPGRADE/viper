import sparticuzChromium from "@sparticuz/chromium";
import { chromium } from "playwright-core";

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

export interface CapturedSession {
  header: "Cookie";
  value: string;
  expiresAt: Date | null;
}

async function launchBrowser() {
  // production use. Tt is a known issue that playwright-core doesn't work with vercel in deployed environment.
  if (process.env.VERCEL) {
    return chromium.launch({
      executablePath: await sparticuzChromium.executablePath(),
      args: sparticuzChromium.args,
      headless: true,
    });
  }
  return chromium.launch({ headless: true }); // playwright-core
}

export async function grabSessionCookie(
  config: SessionLoginConfig,
  userName: string,
  password: string,
  { maxAttempt = 2 }: { maxAttempt?: number } = {},
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
