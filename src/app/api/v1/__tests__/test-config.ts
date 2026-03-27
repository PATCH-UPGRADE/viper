import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import type { IntegrationFormValues } from "@/features/integrations/types";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { createUserToken, DEFAULT_TOKEN_TTL_SECONDS } from "@/lib/tokens";

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
export const setupMockIntegration = async (
  mockIntegrationPayload: IntegrationFormValues,
) => {
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

  const createdIntegration = createIntegrationRes.body[0]?.result?.data.json;
  expect(createdIntegration).toHaveProperty("id");

  onTestFinished(async () => {
    await prisma.integration
      .delete({
        where: { id: createdIntegration.id },
      })
      .catch(() => {});

    // Clean up the integration user that was created
    if (createdIntegration.integrationUserId) {
      await prisma.user
        .delete({
          where: { id: createdIntegration.integrationUserId },
        })
        .catch(() => {});
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

  // create an api key for the integration user
  // this will be used to simulate previous integrationUpload runs
  const apiKey = await auth.api.createApiKey({
    body: {
      name: "integration-user-key",
      userId: createdIntegration.integrationUserId,
    },
  });

  return {
    integration: createdIntegration,
    apiKey,
  };
};

export const createIntegrationToken = (
  integrationUserId: string,
  resourceType: string,
): Promise<string> => {
  return createUserToken(
    integrationUserId,
    DEFAULT_TOKEN_TTL_SECONDS,
    resourceType,
  );
};
