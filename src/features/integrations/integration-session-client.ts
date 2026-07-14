import prisma from "@/lib/db";
import {
  grabSessionCookie,
  SessionLoginConfig,
} from "./teamplay-fleet/capture";

const REAUTH_TIMEOUT = 30_000;

export class IntegrationSessionClient {
  readonly host: string;
  private readonly usernameEnvVar: string;
  private readonly passwordEnvVar: string;
  private readonly loginConfig: SessionLoginConfig;

  constructor(
    host: string,
    username: string,
    password: string,
    loginConfig: SessionLoginConfig,
  ) {
    this.host = host;
    this.usernameEnvVar = username;
    this.passwordEnvVar = password;
    this.loginConfig = loginConfig;
  }

  async fetchWithSession(url: string): Promise<Response> {
    const cached = await prisma.integrationSession.findUnique({
      where: { host: this.host },
    });
    const headers: Record<string, string> = {};

    if (cached) headers[cached.header] = cached.value;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REAUTH_TIMEOUT),
    });

    if (res.status !== 401 && res.status !== 403) return res;

    const session = await this.reauth();

    return fetch(url, {
      headers: { [session.header]: session.value },
      signal: AbortSignal.timeout(REAUTH_TIMEOUT),
    });
  }

  private async reauth() {
    const userName = process.env[this.usernameEnvVar];
    const password = process.env[this.passwordEnvVar];

    if (!userName || !password) {
      throw new Error(
        `${this.usernameEnvVar} / ${this.passwordEnvVar} not set`,
      );
    }

    const session = await grabSessionCookie(
      this.loginConfig,
      userName,
      password,
    );

    await prisma.integrationSession.upsert({
      where: { host: this.host },
      create: {
        host: this.host,
        header: session.header,
        value: session.value,
        expiresAt: session.expiresAt,
      },
      update: {
        header: session.header,
        value: session.value,
        expiresAt: session.expiresAt,
      },
    });

    return session;
  }
}
