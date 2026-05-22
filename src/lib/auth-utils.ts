import { headers } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
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

export const verifyApiKey = async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { valid: false, error: null, key: null };
  }
  let apiKey: string;

  if (authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.substring(7);
  } else {
    apiKey = authHeader;
  }

  const demoToken = process.env.VIPER_DEMO_TOKEN;
  if (demoToken && apiKey === demoToken) {
    const user = await prisma.user.findUnique({
      where: { email: "user@example.com" },
      select: { id: true },
    });
    if (user) {
      return { valid: true, error: null, key: { userId: user.id } };
    }
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
