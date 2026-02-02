import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import prisma from "@/lib/db";

export const BASE_URL = "http://localhost:3000/api/v1";
export const ROOT_API_URL = "http://localhost:3000/api";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is required for tests");
}

export const AUTH_TOKEN = `Bearer ${process.env.API_KEY}`;

export const generateCPE = (suffix: string) =>
  `cpe:2.3:o:vendor:product:${suffix}`;

describe("Configuration Tests", () => {
  it("dummy test", async () => {
    expect(true).toBeTruthy();
  });
});

export const authHeader = { Authorization: AUTH_TOKEN };
export const jsonHeader = { "Content-Type": "application/json" };
export const setupMockIntegration = async (mockIntegrationPayload) => {
  const trpcPayload = {
    "0": {
      json: mockIntegrationPayload,
    },
  };

  const createIntegrationRes = await request(ROOT_API_URL)
    .post("/trpc/integrations.create?batch=1")
    .set(authHeader)
    .set(jsonHeader)
    .send(trpcPayload);

  const responseData = createIntegrationRes.body[0]?.result?.data.json;
  expect(responseData).toHaveProperty("integration");
  expect(responseData).toHaveProperty("apiKey");

  const createdIntegration = responseData.integration;
  onTestFinished(async () => {
    await prisma.integration.delete({
      where: { id: createdIntegration.id },
    });

    // Clean up the integration user that was created
    if (createdIntegration.integrationUserId) {
      await prisma.user.delete({
        where: { id: createdIntegration.integrationUserId },
      });
    }
  });

  expect(createdIntegration.name).toBe(mockIntegrationPayload.name);
  expect(createdIntegration.platform).toBe(mockIntegrationPayload.platform);
  expect(createdIntegration.integrationUri).toBe(
    mockIntegrationPayload.integrationUri,
  );
  expect(createdIntegration.isGeneric).toBe(mockIntegrationPayload.isGeneric);
  expect(createdIntegration.resourceType).toBe(
    mockIntegrationPayload.resourceType,
  );
  expect(createdIntegration.syncEvery).toBe(mockIntegrationPayload.syncEvery);

  return responseData;
};
