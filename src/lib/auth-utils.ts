import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getSafeRedirectPath, withNextParam } from "./auth-redirect";

/**
 * Gets the current session from Better Auth
 * Shared utility to avoid duplicating session fetching logic
 */
export const getSession = async () => {
  return await auth.api.getSession({
    headers: await headers(),
  });
};

export const verifyApiKey = async (req: Request | undefined) => {
  const authHeader = req?.headers.get("Authorization");
  if (!authHeader) {
    return { valid: false, error: null, key: null };
  }
  let apiKey: string;

  if (authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.substring(7);
  } else {
    apiKey = authHeader;
  }

  return await auth.api.verifyApiKey({
    body: {
      key: apiKey,
    },
  });
};

/**
 * Requires authentication; returns the session. When signed out, redirects to
 * `/login?next=<path>` — the path from middleware's `x-viper-request-path` header.
 */
export const requireAuth = async () => {
  const session = await getSession();

  if (!session) {
    const next = getSafeRedirectPath(
      (await headers()).get("x-viper-request-path"),
    );
    redirect(withNextParam("/login", next));
  }

  return session;
};

/**
 * Requires NO authentication. Redirects a signed-in user to a validated `next`
 * app-relative path, or `/`.
 */
export const requireUnauth = async (next?: string) => {
  const session = await getSession();

  if (session) {
    redirect(getSafeRedirectPath(next) ?? "/");
  }
};
