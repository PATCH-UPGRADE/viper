import { getVendorAuthConfig } from "@/config/teamplay-fleet-auth";
import prisma from "@/lib/db";

export async function fetchWithVendorSession(url: string): Promise<Response> {
  const config = getVendorAuthConfig(url);
  if (!config) {
    throw new Error(`No Vendor auth config for ${url}`);
  }

  const host = new URL(url).hostname.toLowerCase();

  const cached = await prisma.vendorSession.findUnique({ where: { host } });

  const headers: Record<string, string> = {};

  if (cached) headers[cached.header] = cached.value;

  let res = await fetch(url, { headers, signal: AbortSignal.timeout(50000) });

  if (res.status !== 401 && res.status !== 403) return res;

  const userName = process.env[config.usernameEnvVar];
  const password = process.env[config.passwordEnvVar];

  if (!userName || !password) {
    throw new Error(
      `${config.usernameEnvVar} / ${config.passwordEnvVar} not set`,
    );
  }
  const { grabSessionCookie } = await import(
    "@/lib/teamplay-fleet-session-capture"
  );
  const session = await grabSessionCookie(
    config.loginConfig,
    userName,
    password,
  );

  await prisma.vendorSession.upsert({
    where: { host },
    create: {
      host,
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

  return fetch(url, {
    headers: { [session.header]: session.value },
    signal: AbortSignal.timeout(30000),
  });
}
