import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import type { IntegrationFormValues } from "@/features/integrations/types";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { normalizeName, parseCpe } from "@/lib/router-utils";
import { createUserToken, DEFAULT_TOKEN_TTL_SECONDS } from "@/lib/tokens";

export const BASE_URL = "http://localhost:3000/api/v1";
export const ROOT_API_URL = "http://localhost:3000/api";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is required for tests");
}

export const AUTH_TOKEN = `Bearer ${process.env.API_KEY}`;

export const generateCPE = (suffix: string) =>
  `cpe:2.3:o:vendor:product:${suffix}`;

/** The canonical manufacturer, product, and version names that a CPE gives. */
function namesFromCpe(cpe: string) {
  const { manufacturer, product, version } = parseCpe(cpe);
  return {
    manufacturer: normalizeName(manufacturer),
    product: normalizeName(product),
    version: version ? normalizeName(version) : null,
  };
}

type CanonicalName = { canonicalName: string } | null | undefined;

/** Checks that an asset has the manufacturer, product, and version its CPE names. */
export function expectDeviceFromCpe(
  asset: {
    manufacturer?: CanonicalName;
    product?: CanonicalName;
    version?: CanonicalName;
  },
  cpe: string,
) {
  const names = namesFromCpe(cpe);
  expect(asset.manufacturer?.canonicalName).toBe(names.manufacturer);
  expect(asset.product?.canonicalName).toBe(names.product);
  expect(asset.version?.canonicalName ?? null).toBe(names.version);
}

/** A device input that names each part by its name. */
export type TestDevice = {
  manufacturer: { name: string };
  product?: { name: string };
  version?: { name: string };
};

export const namedDevice = (
  manufacturer: string,
  product?: string,
  version?: string,
): TestDevice => ({
  manufacturer: { name: manufacturer },
  ...(product ? { product: { name: product } } : {}),
  ...(version ? { version: { name: version } } : {}),
});

export const generateDevice = (suffix: string) =>
  namedDevice("vendor", "product", suffix);

function namesFromDevice(device: TestDevice) {
  return {
    manufacturer: normalizeName(device.manufacturer.name),
    product: device.product ? normalizeName(device.product.name) : null,
    version: device.version ? normalizeName(device.version.name) : null,
  };
}

/** Checks that an asset has the manufacturer, product, and version a device input names. */
export function expectDevice(
  asset: {
    manufacturer?: CanonicalName;
    product?: CanonicalName;
    version?: CanonicalName;
  },
  device: TestDevice,
) {
  const names = namesFromDevice(device);
  expect(asset.manufacturer?.canonicalName).toBe(names.manufacturer);
  expect(asset.product?.canonicalName ?? null).toBe(names.product);
  expect(asset.version?.canonicalName ?? null).toBe(names.version);
}

/** Deletes the assets that have the manufacturer, product, and version a device input names. */
export async function deleteAssetsForDevices(devices: TestDevice[]) {
  for (const device of devices) {
    const names = namesFromDevice(device);
    await prisma.asset.deleteMany({
      where: {
        manufacturer: { canonicalName: names.manufacturer },
        product: names.product
          ? { canonicalName: names.product }
          : { is: null },
        version: names.version
          ? { canonicalName: names.version }
          : { is: null },
      },
    });
  }
}

/** Deletes the assets that have the manufacturer, product, and version a CPE names. */
export async function deleteAssetsForCpes(cpes: string[]) {
  for (const cpe of cpes) {
    const names = namesFromCpe(cpe);
    await prisma.asset.deleteMany({
      where: {
        manufacturer: { canonicalName: names.manufacturer },
        product: { canonicalName: names.product },
        version: names.version
          ? { canonicalName: names.version }
          : { is: null },
      },
    });
  }
}

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
  expect(createdIntegration.config).toMatchObject(
    mockIntegrationPayload.config,
  );
  expect(createdIntegration.syncEvery).toBe(mockIntegrationPayload.syncEvery);
  // Credentials are encrypted bytes and must never come back to a client.
  expect(createdIntegration).not.toHaveProperty("credentials");

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
