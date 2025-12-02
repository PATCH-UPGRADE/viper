import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/**
 * Gets the current session from Better Auth
 * Shared utility to avoid duplicating session fetching logic
 */
export const getSession = async () => {
  return await auth.api.getSession({
    headers: await headers(),
  });
};

export const verifyApiKey = async (headers) => {
  const authHeader = headers.get("Authorization");
  if (!authHeader) {
    return {valid: false, error: null, key: null};
  }
  let apiKey;

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
 * Requires authentication and returns the session
 * Redirects to /login if not authenticated
 */
export const requireAuth = async () => {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
};

/**
 * Requires NO authentication
 * Redirects to / if authenticated
 */
export const requireUnauth = async () => {
  const session = await getSession();

  if (session) {
    redirect("/");
  }
};
