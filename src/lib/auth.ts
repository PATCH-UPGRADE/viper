import { APIError, BetterAuthOptions, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { apiKey } from "better-auth/plugins";
import prisma from "@/lib/db";

// Domains allowed to create accounts
// Note that only development environments will allow non-Google OAuth accounts
export const DOMAIN_WHITELIST = [
  "bugcrowd.com",
  "forallsecure.com",
  "hadronindustries.com",
  "medcrypt.co",
  "medcrypt.com",
  "virtalabs.com",
].map((domain) => domain.toLowerCase());

export const validateDomain = (email: string) => {
  if (process.env.VERCEL_ENV !== "production") return; // Validation is unnecessary for dev environments
  const domain = email.toLowerCase().split("@")[1];
  if (!DOMAIN_WHITELIST.includes(domain)) {
    throw new APIError("FORBIDDEN", {
      message:
        "Your Google domain has not been authorized to access Viper. Please contact the PATCH team for assistance.",
    });
  }
};

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          validateDomain(user.email);
          return { data: user };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
          });
          if (user) {
            validateDomain(user.email);
          }
          return { data: session };
        },
      },
    },
  },
  emailAndPassword: {
    enabled: process.env.NEXT_PUBLIC_TESTING === "True",
    autoSignIn: process.env.NEXT_PUBLIC_TESTING === "True",
  },
  plugins: [apiKey()],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET as string,
    },
  },
  trustedOrigins: [
    "http://localhost:3000",
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001",
  ],
});
