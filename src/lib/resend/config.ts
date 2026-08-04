import "server-only";
const allowFallBack = process.env.NODE_ENV !== "production";
const devFROM = "onboarding@resend.dev";

export function getResendConfig(): {
  apiKey: string;
  from: string;
} {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error(`Missing API KEY`);
  const from = process.env.RESEND_FROM_EMAIL;
  if (from) {
    return { apiKey, from };
  }
  if (allowFallBack) return { apiKey, from: devFROM };
  throw new Error(`RESEND FROM EMAIL is required`);
}
