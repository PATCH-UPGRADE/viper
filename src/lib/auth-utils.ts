import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getSafeRedirectPath } from "./auth-redirect";

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
 * Requires authentication and returns the session. Redirects an unauthenticated
 * user to `/login?next=<current path>` (from the `x-viper-request-path` header
 * set by middleware), or a bare `/login` if that header is absent.
 */
export const requireAuth = async () => {
  const session = await getSession();

  if (!session) {
    const next = getSafeRedirectPath(
      (await headers()).get("x-viper-request-path"),
    );
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }

  return session;
};

/**
 * Requires NO authentication. Redirects an authenticated user to `next` (a
 * validated app-relative path) or `/` — this is what carries the destination
 * through the signup → verification → auto-sign-in chain.
 */
export const requireUnauth = async (next?: string) => {
  const session = await getSession();

  if (session) {
    redirect(getSafeRedirectPath(next) ?? "/");
  }
};
