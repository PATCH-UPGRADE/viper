import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthType, TriggerEnum } from "@/generated/prisma";
import { sendWebhook } from "@/lib/utils";
import { AUTH_TOKEN } from "./test-config";

// override fetch so it doesn't send real fetch calls
global.fetch = vi.fn();
const fetchSpy = vi.spyOn(global, "fetch");

describe("Webhook Endpoints (/webhooks)", () => {
  const webhookPayload = {
    name: "mockWebhook",
    callbackUrl: "http://example.com",
    triggers: [TriggerEnum.DeviceGroup_Created],
    authType: AuthType.Bearer,
    authentication: {
      token: process.env.API_KEY, // "Bearer" we be added back in fetch call
    },
  };

  const webhook = {
    ...webhookPayload,
    id: "someId",
    userId: "someUserId",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("Mock sendWebhook fetch", async () => {
    const mockBody = {
      webhookTrigger: TriggerEnum.DeviceGroup_Created,
      timestamp: new Date(),
    };

    await sendWebhook(mockBody.webhookTrigger, mockBody.timestamp, webhook);

    expect(fetchSpy).toBeCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      webhook.callbackUrl,
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: AUTH_TOKEN,
          "Content-Type": "application/json",
        },
        signal: expect.anything(),
        body: expect.stringContaining(mockBody.webhookTrigger),
      }),
    );
  });
});
