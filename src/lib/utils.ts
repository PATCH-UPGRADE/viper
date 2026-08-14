import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { IntegrationWithStringDates } from "@/features/integrations/types";
import {
  AuthType,
  type Integration,
  type TriggerEnum,
  type Webhook,
} from "@/generated/prisma";
import { basicAuthSchema, bearerAuthSchema, headerAuthSchema } from "./schemas";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function plural(s: string, count: number): string {
  if (count === 1) {
    return s;
  }
  // handle y
  if (s.endsWith("y")) {
    const secondLastChar = s.charAt(s.length - 2);
    // example: vulnerability -> vulnerabilities, but day -> days
    if (/[^aeiou]/i.test(secondLastChar)) {
      return `${s.slice(0, -1)}ies`;
    }
    return `${s}s`;
  }
  return `${s}s`;
}

export const parseAuthenticationJson = (
  itemWithAuth: Integration | IntegrationWithStringDates | Webhook,
) => {
  if (itemWithAuth.authType === AuthType.Basic) {
    // TODO: authentication needs to be encrypted/protected somehow
    const parsed = basicAuthSchema.safeParse(itemWithAuth.authentication);
    if (!parsed.success) {
      throw new Error("Invalid Basic auth configuration");
    }
    const { username, password } = parsed.data;
    const token = Buffer.from(`${username}:${password}`).toString("base64");
    return { header: "Authorization", value: `Basic ${token}` };
  } else if (itemWithAuth.authType === AuthType.Bearer) {
    const parsed = bearerAuthSchema.safeParse(itemWithAuth.authentication);
    if (!parsed.success) {
      throw new Error("Invalid Bearer auth configuration");
    }
    return { header: "Authorization", value: `Bearer ${parsed.data.token}` };
  } else if (itemWithAuth.authType === AuthType.Header) {
    const parsed = headerAuthSchema.safeParse(itemWithAuth.authentication);
    if (!parsed.success) {
      throw new Error("Invalid Header auth configuration");
    }
    return { header: parsed.data.header, value: parsed.data.value };
  }

  throw new Error("Invalid auth configuration");
};

// WARN: need to seperate this function out of prisma-extensions
// because tests will load up the prisma extensions before
// the client is ready - creating a hard-to-debug test error
export const sendWebhook = async (
  triggerType: TriggerEnum,
  timestamp: Date,
  webhook: Webhook,
) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (webhook.authType !== AuthType.None) {
    const { header, value } = parseAuthenticationJson(webhook);
    headers[header] = value;
  }

  return await fetch(webhook.callbackUrl, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      webhookTrigger: triggerType.toString(),
      timestamp: timestamp.toISOString(),
    }),
  });
};

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}
