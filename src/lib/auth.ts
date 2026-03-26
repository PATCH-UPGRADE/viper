import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { apiKey } from "better-auth/plugins";
import { MIN_PASSWORD_LENGTH } from "@/config/constants";
import prisma from "@/lib/db";
import { sendEmail } from "@/lib/mail";

// Domains allowed to create accounts
export const DOMAIN_WHITELIST = (process.env.DOMAIN_WHITELIST || "")
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);

export const validateDomain = (email: string) => {
  if (process.env.VERCEL_ENV !== "production") return; // Validation is unnecessary for dev environments
  const domain = email.toLowerCase().split("@")[1];
  if (!DOMAIN_WHITELIST.includes(domain)) {
    throw new APIError("FORBIDDEN", {
      message:
        "Your domain has not been authorized to access Viper. Please contact the PATCH team for assistance.",
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
          if (user?.email) validateDomain(user.email);
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
          if (user?.email) {
            validateDomain(user.email);
          }
          return { data: session };
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      const subject = "Verify your email address to access Viper";

      await sendEmail({
        to: user.email,
        subject,
        text: `Welcome to Viper.\n\nVerify your email address to finish creating your account:\n${url}\n\nIf you did not sign up for Viper, you can ignore this email.`,
        html: `
          <p>Welcome to Viper.</p>
          <p>
            Verify your email address to finish creating your account:
            <a href="${url}">${url}</a>
          </p>
          <p>If you did not sign up for Viper, you can ignore this email.</p>
        `,
      });
    },
    sendOnSignUp: true,
    sendOnSignIn: true, // Auto-resend the verification email if the user tries to sign in before verifying their account
    autoSignInAfterVerification: true,
  },
  plugins: [apiKey()],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET as string,
    },
    github: {
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET as string,
    },
  },
  trustedOrigins: [
    "http://localhost:3000",
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001",
  ],
});
