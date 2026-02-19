import { fail } from "node:assert";
import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import type { ArtifactWrapperWithUrls } from "@/features/artifacts/types";
import type { DeviceArtifactResponse } from "@/features/device-artifacts/types";
import {
  ArtifactType,
  AuthType,
  ResourceType,
  SyncStatusEnum,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  AUTH_TOKEN,
  authHeader,
  BASE_URL,
  generateCPE,
  jsonHeader,
  setupMockIntegration,
} from "./test-config";

describe("DeviceArtifacts Endpoint (/deviceArtifacts)", () => {
  const payload = {
    cpe: generateCPE("dev_art_v1"),
    role: "Primary Controller",
    description: "Mock -- CT Scanner firmware and documentation",
    upstreamApi: "https://vendor.example.com/api",
    artifacts: [
      {
        name: "Firmware v3.2.1",
        artifactType: ArtifactType.Firmware,
        downloadUrl: "https://vendor.example.com/firmware/v3.2.1.bin",
        size: 2048000,
      },
    ],
  };

  const mockIntegrationPayload = {
    name: "mockVulnIntegration",
    platform: "mockIntegrationPlatform",
    integrationUri: "https://mock-deviceArtifact-upstream-api.com/",
    isGeneric: false,
    authType: AuthType.Bearer,
    resourceType: ResourceType.DeviceArtifact,
    authentication: {
      token: AUTH_TOKEN,
    },
    syncEvery: 300,
  };

  const deviceArtifactsIntegrationPayload = {
    vendor: "mockDeviceArtifactIntegrationVendor",
    items: [
      {
        cpe: "cpe:2.3:h:mock:hispeed_ct_e:*:*:*:*:*:*:*",
        role: "mock-deviceArtifact",
        upstreamApi: "https://mock-deviceArtifact-upstream-api.com/",
        description: "Mock -- run apt update",
        vendorId: "mockDeviceArtifact-1",
        artifacts: [
          {
            name: "mock-deviceArtifact-1",
            artifactType: ArtifactType.Binary,
            downloadUrl: "http://mock.example.com",
          },
        ],
      },
      {
        cpe: "cpe:2.3:h:mock:hispeed_ct_e:*:*:*:*:*:*:*",
        role: "mock-deviceArtifact",
        upstreamApi: "https://mock-deviceArtifact-upstream-api.com/",
        description: "Mock - Turn it off and on again",
        vendorId: "mockDeviceArtifact-2",
        artifacts: [
          {
            name: "mock-deviceArtifact-2",
            artifactType: ArtifactType.Binary,
            downloadUrl: "http://mock.example.com",
          },
        ],
      },
    ],
    page: 1,
    pageSize: 100,
    totalCount: 2,
    totalPages: 1,
    next: null,
    previous: null,
  };

  it("POST /deviceArtifacts - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).post("/deviceArtifacts").send(payload);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /deviceArtifacts - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).get("/deviceArtifacts");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /deviceArtifacts/{id} - Without auth, should 401", async () => {
    const res = await request(BASE_URL).get("/deviceArtifacts/foo");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("PUT /deviceArtifacts/{id} - Without auth, should 401", async () => {
    const res = await request(BASE_URL)
      .put("/deviceArtifacts/foo")
      .send({ description: "updated" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("DELETE /deviceArtifacts/{id} - Without auth, should 401", async () => {
    const res = await request(BASE_URL).delete("/deviceArtifacts/foo");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /deviceArtifacts/integrationUpload - Without auth, should be 401", async () => {
    const res = await request(BASE_URL).get(
      `/deviceArtifacts/integrationUpload`,
    );

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /deviceGroups/{deviceGroupId}/deviceArtifacts - Without auth, should 401", async () => {
    const res = await request(BASE_URL).get(
      "/deviceGroups/foo/deviceArtifacts",
    );

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("POST /deviceArtifacts - Create without artifacts should fail", async () => {
    const invalidPayload = {
      cpe: generateCPE("dev_art_v1"),
      role: "Test Role",
      description: "No artifacts",
      artifacts: [],
    };

    const res = await request(BASE_URL)
      .post("/deviceArtifacts")
      .set(authHeader)
      .send(invalidPayload);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  it("POST /deviceArtifacts - Create without role should fail", async () => {
    const invalidPayload = {
      cpe: generateCPE("dev_art_v1"),
      description: "No role",
      artifacts: [
        {
          name: "Test artifact",
          artifactType: ArtifactType.Firmware,
          downloadUrl: "https://example.com/file.bin",
        },
      ],
    };

    const res = await request(BASE_URL)
      .post("/deviceArtifacts")
      .set(authHeader)
      .send(invalidPayload);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  it("POST /deviceArtifacts - Create without description should fail", async () => {
    const invalidPayload = {
      cpe: generateCPE("dev_art_v1"),
      role: "Test Role",
      artifacts: [
        {
          name: "Test artifact",
          artifactType: ArtifactType.Firmware,
          downloadUrl: "https://example.com/file.bin",
        },
      ],
    };

    const res = await request(BASE_URL)
      .post("/deviceArtifacts")
      .set(authHeader)
      .send(invalidPayload);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  it("/deviceArtifacts - Full CRUD integration test", async () => {
    // Create a device artifact
    const createRes = await request(BASE_URL)
      .post("/deviceArtifacts")
      .set(authHeader)
      .send(payload);

    expect(createRes.status).toBe(200);
    expect(createRes.body).toHaveProperty("id");
    const deviceArtifactId = createRes.body.id;

    onTestFinished(async () => {
      // Cleanup - delete the device artifact (which cascades to artifacts)
      await prisma.deviceArtifact
        .delete({
          where: { id: deviceArtifactId },
        })
        .catch(() => {
          /* already deleted */
        });
    });

    // Verify the response structure
    expect(createRes.body).toHaveProperty("deviceGroup");
    expect(createRes.body.deviceGroup).toEqual(
      expect.objectContaining({ cpe: payload.cpe }),
    );

    expect(createRes.body).toHaveProperty("artifacts");
    expect(Array.isArray(createRes.body.artifacts)).toBe(true);
    expect(createRes.body.artifacts.length).toBe(1);
    expect(createRes.body.artifacts[0]).toHaveProperty("latestArtifact");
    expect(createRes.body.artifacts[0].latestArtifact).toEqual(
      expect.objectContaining({
        name: payload.artifacts[0].name,
        artifactType: payload.artifacts[0].artifactType,
        downloadUrl: payload.artifacts[0].downloadUrl,
        versionNumber: 1,
      }),
    );

    expect(createRes.body.role).toBe(payload.role);
    expect(createRes.body.description).toBe(payload.description);

    // Get single device artifact
    const getOneRes = await request(BASE_URL)
      .get(`/deviceArtifacts/${deviceArtifactId}`)
      .set(authHeader);

    expect(getOneRes.status).toBe(200);
    expect(getOneRes.body.id).toBe(deviceArtifactId);
    expect(getOneRes.body.description).toBe(payload.description);
    expect(getOneRes.body.role).toBe(payload.role);

    // Get list of device artifacts
    const getManyRes = await request(BASE_URL)
      .get("/deviceArtifacts")
      .set(authHeader);

    expect(getManyRes.status).toBe(200);
    expect(getManyRes.body).toHaveProperty("items");
    expect(Array.isArray(getManyRes.body.items)).toBe(true);
    const foundDeviceArtifact = getManyRes.body.items.find(
      (d: DeviceArtifactResponse) => d.id === deviceArtifactId,
    );
    expect(foundDeviceArtifact).toBeDefined();

    // Update the device artifact
    const updateRes = await request(BASE_URL)
      .put(`/deviceArtifacts/${deviceArtifactId}`)
      .set(authHeader)
      .send({
        id: deviceArtifactId,
        description: "Updated description",
        role: "Updated Role",
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.id).toBe(deviceArtifactId);
    expect(updateRes.body.description).toBe("Updated description");
    expect(updateRes.body.role).toBe("Updated Role");

    // Update CPE
    const newCpe = generateCPE("dev_art_v2");
    const updateCpeRes = await request(BASE_URL)
      .put(`/deviceArtifacts/${deviceArtifactId}`)
      .set(authHeader)
      .send({
        id: deviceArtifactId,
        cpe: newCpe,
      });

    expect(updateCpeRes.status).toBe(200);
    expect(updateCpeRes.body.deviceGroup.cpe).toBe(newCpe);

    // Delete the device artifact
    const deleteRes = await request(BASE_URL)
      .delete(`/deviceArtifacts/${deviceArtifactId}`)
      .set(authHeader);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.id).toBe(deviceArtifactId);
  });

  it("POST /deviceArtifacts - Create with multiple artifacts", async () => {
    const multiArtifactPayload = {
      ...payload,
      artifacts: [
        {
          name: "Firmware v3.2.1",
          artifactType: ArtifactType.Firmware,
          downloadUrl: "https://vendor.example.com/firmware/v3.2.1.bin",
          size: 2048000,
        },
        {
          name: "User Manual",
          artifactType: ArtifactType.Documentation,
          downloadUrl: "https://vendor.example.com/docs/manual.pdf",
          size: 150000,
        },
        {
          name: "Source Code",
          artifactType: ArtifactType.Source,
          downloadUrl: "https://github.com/vendor/device/v3.2.1.tar.gz",
        },
        {
          name: "Binary Package",
          artifactType: ArtifactType.Binary,
          downloadUrl: "https://vendor.example.com/binaries/v3.2.1.zip",
          size: 5000000,
        },
      ],
    };

    const createRes = await request(BASE_URL)
      .post("/deviceArtifacts")
      .set(authHeader)
      .send(multiArtifactPayload);

    onTestFinished(async () => {
      await prisma.deviceArtifact
        .delete({
          where: { id: createRes.body.id },
        })
        .catch(() => {
          /* already deleted */
        });
    });

    expect(createRes.status).toBe(200);
    expect(createRes.body.artifacts.length).toBe(4);

    // Verify each artifact was created correctly
    const artifactTypes = createRes.body.artifacts.map(
      (wrapper: ArtifactWrapperWithUrls) => wrapper.latestArtifact.artifactType,
    );
    expect(artifactTypes).toContain(ArtifactType.Firmware);
    expect(artifactTypes).toContain(ArtifactType.Documentation);
    expect(artifactTypes).toContain(ArtifactType.Source);
    expect(artifactTypes).toContain(ArtifactType.Binary);
  });

  it("GET /deviceArtifacts - Pagination test", async () => {
    // Create multiple device artifacts
    const createPromises = Array.from({ length: 5 }, (_, i) =>
      request(BASE_URL)
        .post("/deviceArtifacts")
        .set(authHeader)
        .send({
          ...payload,
          description: `Test device artifact ${i}`,
          cpe: generateCPE(`dev_art_pagination_${i}`),
        }),
    );

    const createResults = await Promise.all(createPromises);
    const deviceArtifactIds = createResults.map((r) => r.body.id);

    onTestFinished(async () => {
      await Promise.all(
        deviceArtifactIds.map((id) =>
          prisma.deviceArtifact.delete({ where: { id } }).catch(() => {
            /* already deleted */
          }),
        ),
      );
    });

    // Test pagination
    const page1Res = await request(BASE_URL)
      .get("/deviceArtifacts?page=1&pageSize=2")
      .set(authHeader);

    expect(page1Res.status).toBe(200);
    expect(page1Res.body.items.length).toBeLessThanOrEqual(2);
    expect(page1Res.body).toHaveProperty("totalCount");
    expect(page1Res.body).toHaveProperty("pageSize");
    expect(page1Res.body.pageSize).toBe(2);
  });

  it("GET /deviceArtifacts - Search test", async () => {
    const searchTerm = "unique-search-artifact-67890";
    const createRes = await request(BASE_URL)
      .post("/deviceArtifacts")
      .set(authHeader)
      .send({
        ...payload,
        description: `This contains the ${searchTerm} for testing`,
      });

    expect(createRes.status).toBe(200);
    const deviceArtifactId = createRes.body.id;

    onTestFinished(async () => {
      await prisma.deviceArtifact
        .delete({
          where: { id: deviceArtifactId },
        })
        .catch(() => {
          /* already deleted */
        });
    });

    // Search for the device artifact
    const searchRes = await request(BASE_URL)
      .get(`/deviceArtifacts?search=${searchTerm}`)
      .set(authHeader);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.items.length).toBeGreaterThan(0);
    const found = searchRes.body.items.some(
      (d: DeviceArtifactResponse) => d.id === deviceArtifactId,
    );
    expect(found).toBe(true);
  });

  it("GET /deviceGroups/{deviceGroupId}/deviceArtifacts - Filter by device group", async () => {
    const cpe1 = generateCPE("dev_art_group1");
    const cpe2 = generateCPE("dev_art_group2");

    // Create device artifacts with different CPEs
    const createRes1 = await request(BASE_URL)
      .post("/deviceArtifacts")
      .set(authHeader)
      .send({
        ...payload,
        cpe: cpe1,
        description: "Device artifact for group 1",
      });

    const createRes2 = await request(BASE_URL)
      .post("/deviceArtifacts")
      .set(authHeader)
      .send({
        ...payload,
        cpe: cpe2,
        description: "Device artifact for group 2",
      });

    expect(createRes1.status).toBe(200);
    expect(createRes2.status).toBe(200);

    const deviceGroupId1 = createRes1.body.deviceGroup.id;
    const deviceGroupId2 = createRes2.body.deviceGroup.id;

    onTestFinished(async () => {
      await prisma.deviceArtifact
        .delete({ where: { id: createRes1.body.id } })
        .catch(() => {
          /* already deleted */
        });
      await prisma.deviceArtifact
        .delete({ where: { id: createRes2.body.id } })
        .catch(() => {
          /* already deleted */
        });
    });

    // Get device artifacts for group 1
    const group1Res = await request(BASE_URL)
      .get(`/deviceGroups/${deviceGroupId1}/deviceArtifacts`)
      .set(authHeader);

    expect(group1Res.status).toBe(200);
    expect(group1Res.body.items.length).toBeGreaterThan(0);
    const allInGroup1 = group1Res.body.items.every(
      (d: DeviceArtifactResponse) => d.deviceGroup.id === deviceGroupId1,
    );
    expect(allInGroup1).toBe(true);

    // Get device artifacts for group 2
    const group2Res = await request(BASE_URL)
      .get(`/deviceGroups/${deviceGroupId2}/deviceArtifacts`)
      .set(authHeader);

    expect(group2Res.status).toBe(200);
    expect(group2Res.body.items.length).toBeGreaterThan(0);
    const allInGroup2 = group2Res.body.items.every(
      (d: DeviceArtifactResponse) => d.deviceGroup.id === deviceGroupId2,
    );
    expect(allInGroup2).toBe(true);
  });

  it("empty DeviceArtifact uploadIntegration endpoint int test", async () => {
    const { apiKey } = await setupMockIntegration(mockIntegrationPayload);

    // this should succeed and nothing should be created
    const noDeviceArtifacts = {
      ...deviceArtifactsIntegrationPayload,
      items: [],
    };
    const createRes = await request(BASE_URL)
      .post("/deviceArtifacts/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(noDeviceArtifacts);

    expect(createRes.status).toBe(200);
    expect(createRes.body.createdItemsCount).toBe(0);
    expect(createRes.body.updatedItemsCount).toBe(0);
    expect(createRes.body.shouldRetry).toBe(false);
    expect(createRes.body.message).toBe("success");
  });

  it("create DeviceArtifact uploadIntegration endpoint int test", async () => {
    const { integration: createdIntegration, apiKey } =
      await setupMockIntegration(mockIntegrationPayload);

    onTestFinished(async () => {
      await prisma.deviceArtifact.deleteMany({
        where: {
          description: {
            contains: "mock",
            mode: "insensitive" as const,
          },
        },
      });
    });

    const integrationRes = await request(BASE_URL)
      .post("/deviceArtifacts/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(deviceArtifactsIntegrationPayload);

    console.log(integrationRes);

    expect(integrationRes.status).toBe(200);
    expect(integrationRes.body.createdItemsCount).toBe(2);
    expect(integrationRes.body.updatedItemsCount).toBe(0);
    expect(integrationRes.body.shouldRetry).toBe(false);
    expect(integrationRes.body.message).toBe("success");

    const daPayload1 = deviceArtifactsIntegrationPayload.items[0];
    const mapping1 =
      await prisma.externalDeviceArtifactMapping.findFirstOrThrow({
        where: {
          externalId: daPayload1.vendorId,
        },
      });

    const foundDeviceArtifact1 = await prisma.deviceArtifact.findFirstOrThrow({
      where: {
        id: mapping1.itemId,
      },
      include: {
        deviceGroup: true,
        artifacts: true,
      },
    });

    expect(mapping1.integrationId).toBe(createdIntegration.id);
    expect(mapping1.externalId).toBe(daPayload1.vendorId);

    expect(foundDeviceArtifact1.description).toBe(daPayload1.description);
    expect(foundDeviceArtifact1.upstreamApi).toBe(daPayload1.upstreamApi);
    expect(foundDeviceArtifact1.deviceGroup.cpe).toBe(daPayload1.cpe);
    expect(foundDeviceArtifact1.artifacts.length).toBe(1);

    const daPayload2 = deviceArtifactsIntegrationPayload.items[1];
    const mapping2 =
      await prisma.externalDeviceArtifactMapping.findFirstOrThrow({
        where: {
          externalId: daPayload2.vendorId,
        },
      });

    const foundDeviceArtifact2 = await prisma.deviceArtifact.findFirstOrThrow({
      where: {
        id: mapping2.itemId,
      },
      include: {
        deviceGroup: true,
        artifacts: true,
      },
    });

    expect(mapping2.integrationId).toBe(createdIntegration.id);
    expect(mapping2.externalId).toBe(daPayload2.vendorId);

    expect(foundDeviceArtifact2.description).toBe(daPayload2.description);
    expect(foundDeviceArtifact2.upstreamApi).toBe(daPayload2.upstreamApi);
    expect(foundDeviceArtifact2.deviceGroup.cpe).toBe(daPayload2.cpe);
    expect(foundDeviceArtifact2.artifacts.length).toBe(1);

    if (!mapping1.lastSynced || !mapping2.lastSynced) {
      fail("lastSynced values should not be null");
    }

    expect(mapping1.lastSynced).toStrictEqual(mapping2.lastSynced);

    const foundSync = await prisma.syncStatus.findFirstOrThrow({
      where: { syncedAt: mapping1.lastSynced },
    });

    expect(foundSync.integrationId).toBe(createdIntegration.id);
    expect(foundSync.status).toBe(SyncStatusEnum.Success);
    expect(foundSync.errorMessage).toBeNullable();
    expect(foundSync.syncedAt).toStrictEqual(mapping2.lastSynced);
  });
});
