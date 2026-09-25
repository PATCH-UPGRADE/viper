import { createHash } from "node:crypto";
import { createServerSingleton } from "@/lib/singleton";
import type { FleetCreds } from "./config";
import type { CapturedSession } from "./session";

/**
 * A Fleet cookie is treated as stale this long before its stated expiry, so a
 * request does not leave with a cookie that expires in flight.
 */
const EXPIRY_SKEW_MS = 60_000;

interface Entry {
  fingerprint: string;
  cookie: Promise<CapturedSession>;
  /** Set once `cookie` resolves. Unset while the login is still running. */
  value?: CapturedSession;
}

// One cookie per integration, for the life of this process. On serverless a
// warm instance reuses it and a cold one signs in again. It is never persisted,
// because a cookie is a live bearer credential.
const getEntries = createServerSingleton(
  "fleet-cookies",
  () => new Map<string, Entry>(),
);

/** Changed credentials must force a new login, but the key never holds a password. */
export const fingerprintOf = ({ username, password }: FleetCreds): string =>
  createHash("sha256").update(`${username}\0${password}`).digest("hex");

const isStale = ({ expiresAt }: CapturedSession): boolean =>
  expiresAt !== null && expiresAt.getTime() - EXPIRY_SKEW_MS <= Date.now();

/**
 * The cached cookie for this integration, or a new login. A login still in
 * flight is shared, so concurrent callers sign in once.
 */
export function getCookie(
  integrationId: string,
  fingerprint: string,
  login: () => Promise<CapturedSession>,
): Promise<CapturedSession> {
  const entries = getEntries();
  const entry = entries.get(integrationId);
  if (
    entry?.fingerprint === fingerprint &&
    !(entry.value && isStale(entry.value))
  ) {
    return entry.cookie;
  }

  const next: Entry = { fingerprint, cookie: login() };
  entries.set(integrationId, next);
  next.cookie.then(
    (value) => {
      next.value = value;
    },
    () => {
      if (entries.get(integrationId) === next) entries.delete(integrationId);
    },
  );
  return next.cookie;
}

/**
 * Drop a cookie that Fleet rejected. Only that cookie: if another request
 * already replaced it, the replacement stays, so two failures cause one login.
 */
export function invalidate(
  integrationId: string,
  rejected: CapturedSession,
): void {
  const entries = getEntries();
  if (entries.get(integrationId)?.value === rejected) {
    entries.delete(integrationId);
  }
}
