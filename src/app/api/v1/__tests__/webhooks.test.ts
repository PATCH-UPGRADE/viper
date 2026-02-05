import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthType, TriggerEnum, type Webhook } from "@/generated/prisma";
import { sendWebhook } from "@/lib/prisma-client-extensions";
import { AUTH_TOKEN, BASE_URL, generateCPE } from "./test-config";

describe("Webhook Endpoints (/webhooks)", () => {
  const authHeader = { Authorization: AUTH_TOKEN };

  const webhook: Webhook = {
    id: "someId",
    userId: "someUserId",
    name: "mockWebhook",
    callbackUrl: "http://example.com",
    triggers: [TriggerEnum.DeviceGroup_Updated],
    authType: AuthType.None,
    authentication: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const assetPayload = {
    ip: "192.168.1.100",
    cpe: generateCPE("asset_v1"),
    role: "Primary Server",
    upstreamApi: "https://api.hospital-upstream.com/v1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Mock sendWebhook fetch", async () => {
    const mockData = {
      webhookTrigger: TriggerEnum.DeviceGroup_Updated,
      timestamp: new Date(),
    };
    // @ts-expect-error
    global.fetch = vi.fn(() => {
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      });
    });

    await sendWebhook(mockData.webhookTrigger, mockData.timestamp, webhook);
    expect(global.fetch).toHaveBeenCalledWith(
      webhook.callbackUrl,
      expect.anything(),
    );
  });

  it("Test DeviceGroup creation with Mocked Fetch", async () => {
    const mockData = {
      webhookTrigger: TriggerEnum.DeviceGroup_Updated,
      timestamp: new Date(),
    };

    // @ts-expect-error
    global.fetch = vi.fn(() => {
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(),
      });
    });

    // common scenario creating an Asset will automatically create a DeviceGroup
    const assetRes = await request(BASE_URL)
      .post("/assets")
      .set(authHeader)
      .send(assetPayload);
    expect(assetRes.status).toBe(200);
    expect(assetRes.body).toHaveProperty("deviceGroup");

    await request(BASE_URL)
      .delete(`/assets/${assetRes.body.id}`)
      .set(authHeader)
      .send(assetPayload);

    expect(global.fetch).toHaveBeenCalledWith(
      webhook.callbackUrl,
      expect.anything(),
    );
  });
});
