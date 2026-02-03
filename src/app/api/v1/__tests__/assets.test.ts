import { fail } from "node:assert";
import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import { AuthType, ResourceType, SyncStatusEnum } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  AUTH_TOKEN,
  authHeader,
  BASE_URL,
  generateCPE,
  jsonHeader,
  setupMockIntegration,
} from "./test-config";

describe("Assets Endpoint (/assets)", () => {
  const payload = {
    ip: "192.168.1.100",
    cpe: generateCPE("asset_v1"),
    role: "Primary Server",
    upstreamApi: "https://api.hospital-upstream.com/v1",
  };

  const payload2 = {
    ip: "192.168.1.101",
    cpe: generateCPE("asset_v1"),
    role: "Primary Server",
    upstreamApi: "https://api.hospital-upstream.com/v1",
  };

  const mockIntegrationPayload = {
    name: "mockIntegration",
    platform: "mockIntegrationPlatform",
    integrationUri: "https://mock-upstream-api.com/",
    isGeneric: false,
    authType: AuthType.Bearer,
    resourceType: ResourceType.Asset,
    authentication: {
      token: AUTH_TOKEN,
    },
    syncEvery: 300,
  };

  const assetIntegrationPayload = {
    vendor: "mockIntegrationVendor",
    items: [
      {
        ip: "172.20.15.244",
        networkSegment: "Mock Medical Imaging VLAN",
        cpe: "cpe:2.3:h:mock:hispeed_ct_e:*:*:*:*:*:*:*",
        role: "CT Scanner",
        upstreamApi: "https://mock-upstream-api.com/",
        hostname: "med-mock-00001.hospital.local",
        macAddress: "11:11:11:11:11:11",
        serialNumber: "GH-2019-00001",
        location: {
          facility: "Main Campus",
          building: "Diagnostic Imaging Center",
          floor: "B1",
          room: "RAD-001",
        },
        status: "Active",
        vendorId: "mockIntegration-1",
      },
      {
        ip: "172.20.15.245",
        networkSegment: "Mock Medical Imaging VLAN",
        cpe: "cpe:2.3:h:mock:brive_ct315:*:*:*:*:*:*:*",
        role: "CT Scanner",
        upstreamApi: "https://mock-upstream-api.com/",
        hostname: "med-mock-00002.hospital.local",
        macAddress: "11:11:11:11:11:12",
        serialNumber: "GH-2019-00002",
        location: {
          facility: "Main Campus",
          building: "Diagnostic Imaging Center",
          floor: "B1",
          room: "RAD-002",
        },
        status: "Active",
        vendorId: "mockIntegration-2",
      },
    ],
    page: 1,
    pageSize: 100,
    totalCount: 2,
    totalPages: 1,
    next: null,
    previous: null,
  };

  it("POST /assets - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).post("/assets").send(payload);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("POST /assets/bulk - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).post("/assets/bulk").send(payload);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /assets - Without auth, should be 401", async () => {
    const res = await request(BASE_URL)
      .get("/assets")
      .query({ page: 1, pageSize: 5 });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /assets/{id} - Without auth, should be 401", async () => {
    const res = await request(BASE_URL).get(`/assets/foo`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /assets/integrationUpload - Without auth, should be 401", async () => {
    const res = await request(BASE_URL).get(`/assets/integrationUpload`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("Assets endpoint integration test", async () => {
    const res = await request(BASE_URL)
      .post("/assets")
      .set(authHeader)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body.ip).toBe(payload.ip);

    const assetId = res.body.id;

    const getRes = await request(BASE_URL)
      .get("/assets")
      .query({ page: 1, pageSize: 5 })
      .set(authHeader);

    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body.items)).toBe(true);

    const detailRes = await request(BASE_URL)
      .get(`/assets/${assetId}`)
      .set(authHeader);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.id).toBe(assetId);

    const deviceGroupId = detailRes.body.deviceGroup.id;

    const listByDeviceGroupRes = await request(BASE_URL)
      .get(`/deviceGroups/${deviceGroupId}/assets`)
      .set(authHeader);

    expect(listByDeviceGroupRes.status).toBe(200);
    expect(listByDeviceGroupRes.body.items[0].deviceGroup.id).toBe(
      deviceGroupId,
    );

    const updatePayload = {
      ip: "192.168.1.105", // Updated field
      cpe: generateCPE("asset_v1"),
      role: "Backup Server",
      upstreamApi: "https://api.hospital-upstream.com/v1",
    };

    const putRes = await request(BASE_URL)
      .put(`/assets/${assetId}`)
      .set(authHeader)
      .send(updatePayload);

    expect(putRes.status).toBe(200);
    expect(putRes.body.role).toBe("Backup Server");

    const deleteRes = await request(BASE_URL)
      .delete(`/assets/${assetId}`)
      .set(authHeader);

    expect(deleteRes.status).toBe(200);
  });

  it("Assets bulk endpoint happy path integration test", async () => {
    // POST create the assets
    const reqData = { assets: [payload, payload2] };
    const res = await request(BASE_URL)
      .post("/assets/bulk")
      .set(authHeader)
      .set(jsonHeader)
      .send(reqData);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);

    const bodyFirst = res.body.at(0);
    expect(bodyFirst).toHaveProperty("id");
    expect(bodyFirst.ip).toBe(payload.ip);
    expect(bodyFirst.deviceGroup.cpe).toBe(payload.cpe);
    expect(bodyFirst.deviceGroup).toHaveProperty("url");
    expect(bodyFirst.deviceGroup).toHaveProperty("sbomUrl");
    expect(bodyFirst.deviceGroup).toHaveProperty("vulnerabilitiesUrl");
    expect(bodyFirst.deviceGroup).toHaveProperty("assetsUrl");
    expect(bodyFirst.deviceGroup).toHaveProperty("deviceArtifactsUrl");
    expect(bodyFirst.role).toBe(payload.role);
    expect(bodyFirst.upstreamApi).toBe(payload.upstreamApi);

    const bodySecond = res.body.at(1);
    expect(bodySecond).toHaveProperty("id");
    expect(bodySecond.ip).toBe(payload2.ip);
    expect(bodySecond.deviceGroup.cpe).toBe(payload2.cpe);
    expect(bodySecond.role).toBe(payload2.role);
    expect(bodySecond.upstreamApi).toBe(payload2.upstreamApi);

    // GET first payload from DB
    const firstAssetId = bodyFirst.id;
    const firstDetailRes = await request(BASE_URL)
      .get(`/assets/${firstAssetId}`)
      .set(authHeader);

    expect(firstDetailRes.status).toBe(200);
    expect(firstDetailRes.body.id).toBe(firstAssetId);
    expect(firstDetailRes.body.ip).toBe(payload.ip);
    expect(firstDetailRes.body.deviceGroup.cpe).toBe(payload.cpe);
    expect(firstDetailRes.body.deviceGroup).toHaveProperty("url");
    expect(firstDetailRes.body.role).toBe(payload.role);
    expect(firstDetailRes.body.upstreamApi).toBe(payload.upstreamApi);

    // GET second payload from DB
    const secondAssetId = bodySecond.id;
    const secondDetailRes = await request(BASE_URL)
      .get(`/assets/${secondAssetId}`)
      .set(authHeader);

    expect(secondDetailRes.status).toBe(200);
    expect(secondDetailRes.body.id).toBe(secondAssetId);
    expect(secondDetailRes.body.ip).toBe(payload2.ip);
    expect(secondDetailRes.body.deviceGroup.cpe).toBe(payload2.cpe);
    expect(secondDetailRes.body.role).toBe(payload2.role);
    expect(secondDetailRes.body.upstreamApi).toBe(payload2.upstreamApi);

    // DELETE the assets
    const deleteFirstAssetRes = await request(BASE_URL)
      .delete(`/assets/${firstAssetId}`)
      .set(authHeader);

    expect(deleteFirstAssetRes.status).toBe(200);

    const deleteSecondAssetRes = await request(BASE_URL)
      .delete(`/assets/${secondAssetId}`)
      .set(authHeader);

    expect(deleteSecondAssetRes.status).toBe(200);
  });

  it("Assets bulk endpoint no data fail case", async () => {
    const emptyData = {};
    const emptyDataRes = await request(BASE_URL)
      .post("/assets/bulk")
      .set(authHeader)
      .set(jsonHeader)
      .send(emptyData);

    expect(emptyDataRes.status).toBe(400);
  });

  it("Assets bulk endpoint empty asset array fail case", async () => {
    const emptyAssets = { assets: [] };
    const emptyAssetsRes = await request(BASE_URL)
      .post("/assets/bulk")
      .set(authHeader)
      .set(jsonHeader)
      .send(emptyAssets);

    expect(emptyAssetsRes.status).toBe(400);
  });

  it("Assets bulk endpoint bad asset fail case", async () => {
    const blankAsset = { assets: [{}] };
    const blankAssetRes = await request(BASE_URL)
      .post("/assets/bulk")
      .set(authHeader)
      .set(jsonHeader)
      .send(blankAsset);

    expect(blankAssetRes.status).toBe(400);
  });

  it("Assets bulk endpoint bad first asset in array fail case", async () => {
    const blankFirstAsset = { assets: [{}, payload] };
    const blankFirstAssetRes = await request(BASE_URL)
      .post("/assets/bulk")
      .set(authHeader)
      .set(jsonHeader)
      .send(blankFirstAsset);

    expect(blankFirstAssetRes.status).toBe(400);
  });

  it("Assets bulk endpoint bad second asset in array fail case", async () => {
    const blankSecondAsset = { assets: [payload, {}] };
    const blankSecondAssetRes = await request(BASE_URL)
      .post("/assets/bulk")
      .set(authHeader)
      .set(jsonHeader)
      .send(blankSecondAsset);

    expect(blankSecondAssetRes.status).toBe(400);
  });

  it("no prior Integration Asset uploadIntegration fail test", async () => {
    const integrationResp = await request(BASE_URL)
      .post("/assets/integrationUpload")
      .set(authHeader)
      .set(jsonHeader)
      .send(assetIntegrationPayload);

    // endpoint requires the user to create an Integration (db model) first
    expect(integrationResp.status).toBe(500);
  });

  it("empty Assets uploadIntegration endpoint int test", async () => {
    const { apiKey } = await setupMockIntegration(mockIntegrationPayload);

    // this should succeed and nothing should be created
    const noAssets = { ...assetIntegrationPayload, items: [] };
    const createAssetResp = await request(BASE_URL)
      .post("/assets/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(noAssets);

    expect(createAssetResp.status).toBe(200);
    expect(createAssetResp.body.createdItemsCount).toBe(0);
    expect(createAssetResp.body.updatedItemsCount).toBe(0);
    expect(createAssetResp.body.shouldRetry).toBe(false);
    expect(createAssetResp.body.message).toBe("success");
  });

  it("create Assets uploadIntegration endpoint int test", async () => {
    const { integration: createdIntegration, apiKey } =
      await setupMockIntegration(mockIntegrationPayload);

    onTestFinished(async () => {
      // this won't throw errors if it misses, which messes up the onTestFinished stack
      await prisma.asset.deleteMany({
        where: {
          networkSegment: {
            contains: "mock",
            mode: "insensitive" as const,
          },
          hostname: {
            contains: "mock",
            mode: "insensitive" as const,
          },
        },
      });
    });

    const integrationRes = await request(BASE_URL)
      .post("/assets/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(assetIntegrationPayload);

    expect(integrationRes.status).toBe(200);
    expect(integrationRes.body.createdItemsCount).toBe(2);
    expect(integrationRes.body.updatedItemsCount).toBe(0);
    expect(integrationRes.body.shouldRetry).toBe(false);
    expect(integrationRes.body.message).toBe("success");

    const assetPayload1 = assetIntegrationPayload.items[0];
    const mapping1 = await prisma.externalAssetMapping.findFirstOrThrow({
      where: {
        externalId: assetPayload1.vendorId,
      },
    });

    const foundAsset1 = await prisma.asset.findFirstOrThrow({
      where: {
        id: mapping1.itemId,
      },
      include: {
        deviceGroup: true,
      },
    });

    expect(mapping1.integrationId).toBe(createdIntegration.id);
    expect(mapping1.externalId).toBe(assetPayload1.vendorId);

    expect(foundAsset1.networkSegment).toBe(assetPayload1.networkSegment);
    expect(foundAsset1.role).toBe(assetPayload1.role);
    expect(foundAsset1.upstreamApi).toBe(assetPayload1.upstreamApi);
    expect(foundAsset1.hostname).toBe(assetPayload1.hostname);
    expect(foundAsset1.macAddress).toBe(assetPayload1.macAddress);
    expect(foundAsset1.serialNumber).toBe(assetPayload1.serialNumber);
    expect(foundAsset1.location).toStrictEqual(assetPayload1.location);
    expect(foundAsset1.status).toBe(assetPayload1.status);
    expect(foundAsset1.deviceGroup.cpe).toBe(assetPayload1.cpe);

    const assetPayload2 = assetIntegrationPayload.items[1];
    const mapping2 = await prisma.externalAssetMapping.findFirstOrThrow({
      where: {
        externalId: assetPayload2.vendorId,
      },
    });

    const foundAsset2 = await prisma.asset.findFirstOrThrow({
      where: {
        id: mapping2.itemId,
      },
      include: {
        deviceGroup: true,
      },
    });

    expect(mapping2.integrationId).toBe(createdIntegration.id);
    expect(mapping2.externalId).toBe(assetPayload2.vendorId);

    expect(foundAsset2.networkSegment).toBe(assetPayload2.networkSegment);
    expect(foundAsset2.role).toBe(assetPayload2.role);
    expect(foundAsset2.upstreamApi).toBe(assetPayload2.upstreamApi);
    expect(foundAsset2.hostname).toBe(assetPayload2.hostname);
    expect(foundAsset2.macAddress).toBe(assetPayload2.macAddress);
    expect(foundAsset2.serialNumber).toBe(assetPayload2.serialNumber);
    expect(foundAsset2.location).toStrictEqual(assetPayload2.location);
    expect(foundAsset2.status).toBe(assetPayload2.status);
    expect(foundAsset2.deviceGroup.cpe).toBe(assetPayload2.cpe);

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

  it("update Assets uploadIntegration endpoint int test", async () => {
    const { integration: createdIntegration, apiKey } =
      await setupMockIntegration(mockIntegrationPayload);

    onTestFinished(async () => {
      // this won't cause an error if it misses which messes up the onTestFinished stack
      await prisma.asset.deleteMany({
        where: {
          networkSegment: {
            contains: "mock",
            mode: "insensitive" as const,
          },
          hostname: {
            contains: "mock",
            mode: "insensitive" as const,
          },
        },
      });
    });

    // create the assets first
    const createAssetsReq = await request(BASE_URL)
      .post("/assets/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(assetIntegrationPayload);

    expect(createAssetsReq.status).toBe(200);
    expect(createAssetsReq.body.createdItemsCount).toBe(2);
    expect(createAssetsReq.body.updatedItemsCount).toBe(0);
    expect(createAssetsReq.body.shouldRetry).toBe(false);
    expect(createAssetsReq.body.message).toBe("success");

    // update some field before updating
    const updateAssetsPayload = {
      ...assetIntegrationPayload,
      ...assetIntegrationPayload.items,
    };
    const newUpstreamApi = "https://mock-upstream-api.com/v2";
    updateAssetsPayload.items[0].upstreamApi = newUpstreamApi;
    updateAssetsPayload.items[1].upstreamApi = newUpstreamApi;

    const integrationRes = await request(BASE_URL)
      .post("/assets/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(updateAssetsPayload);

    expect(integrationRes.status).toBe(200);
    expect(integrationRes.body.createdItemsCount).toBe(0);
    expect(integrationRes.body.updatedItemsCount).toBe(2);
    expect(integrationRes.body.shouldRetry).toBe(false);
    expect(integrationRes.body.message).toBe("success");

    const assetPayload1 = updateAssetsPayload.items[0];
    const mapping1 = await prisma.externalAssetMapping.findFirstOrThrow({
      where: {
        externalId: assetPayload1.vendorId,
      },
    });

    const foundAsset1 = await prisma.asset.findFirstOrThrow({
      where: {
        id: mapping1.itemId,
      },
      include: {
        deviceGroup: true,
      },
    });

    expect(mapping1.integrationId).toBe(createdIntegration.id);
    expect(mapping1.externalId).toBe(assetPayload1.vendorId);

    expect(foundAsset1.networkSegment).toBe(assetPayload1.networkSegment);
    expect(foundAsset1.role).toBe(assetPayload1.role);
    expect(foundAsset1.upstreamApi).toBe(newUpstreamApi); // this field should be updated
    expect(foundAsset1.hostname).toBe(assetPayload1.hostname);
    expect(foundAsset1.macAddress).toBe(assetPayload1.macAddress);
    expect(foundAsset1.serialNumber).toBe(assetPayload1.serialNumber);
    expect(foundAsset1.location).toStrictEqual(assetPayload1.location);
    expect(foundAsset1.status).toBe(assetPayload1.status);
    expect(foundAsset1.deviceGroup.cpe).toBe(assetPayload1.cpe);

    const assetPayload2 = updateAssetsPayload.items[1];
    const mapping2 = await prisma.externalAssetMapping.findFirstOrThrow({
      where: {
        externalId: assetPayload2.vendorId,
      },
    });

    const foundAsset2 = await prisma.asset.findFirstOrThrow({
      where: {
        id: mapping2.itemId,
      },
      include: {
        deviceGroup: true,
      },
    });

    if (!mapping1.lastSynced || !mapping2.lastSynced) {
      fail("lastSynced values should not be null");
    }

    expect(mapping1.lastSynced).toStrictEqual(mapping2.lastSynced);

    expect(mapping2.integrationId).toBe(createdIntegration.id);
    expect(mapping2.externalId).toBe(assetPayload2.vendorId);

    expect(foundAsset2.networkSegment).toBe(assetPayload2.networkSegment);
    expect(foundAsset2.role).toBe(assetPayload2.role);
    expect(foundAsset2.upstreamApi).toBe(newUpstreamApi); // this field should be updated
    expect(foundAsset2.hostname).toBe(assetPayload2.hostname);
    expect(foundAsset2.macAddress).toBe(assetPayload2.macAddress);
    expect(foundAsset2.serialNumber).toBe(assetPayload2.serialNumber);
    expect(foundAsset2.location).toStrictEqual(assetPayload2.location);
    expect(foundAsset2.status).toBe(assetPayload2.status);
    expect(foundAsset2.deviceGroup.cpe).toBe(assetPayload2.cpe);

    const foundSync = await prisma.syncStatus.findFirstOrThrow({
      where: { syncedAt: mapping1.lastSynced },
    });

    expect(foundSync.integrationId).toBe(createdIntegration.id);
    expect(foundSync.status).toBe(SyncStatusEnum.Success);
    expect(foundSync.errorMessage).toBeNullable();
    expect(foundSync.syncedAt).toStrictEqual(mapping2.lastSynced);
  });

  it("mixed create+update Assets uploadIntegration endpoint int test", async () => {
    const { integration: createdIntegration, apiKey } =
      await setupMockIntegration(mockIntegrationPayload);

    onTestFinished(async () => {
      // this won't throw errors if it misses, which messes up the onTestFinished stack
      await prisma.asset.deleteMany({
        where: {
          networkSegment: {
            contains: "mock",
            mode: "insensitive" as const,
          },
          hostname: {
            contains: "mock",
            mode: "insensitive" as const,
          },
        },
      });
    });

    // create one asset first
    const oneAsset = {
      ...assetIntegrationPayload,
      items: assetIntegrationPayload.items.slice(1),
    };
    const createAssetResp = await request(BASE_URL)
      .post("/assets/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(oneAsset);

    expect(createAssetResp.status).toBe(200);
    expect(createAssetResp.body.createdItemsCount).toBe(1);
    expect(createAssetResp.body.updatedItemsCount).toBe(0);
    expect(createAssetResp.body.shouldRetry).toBe(false);
    expect(createAssetResp.body.message).toBe("success");

    // now create another asset and update the existing one
    const createWithUpdateAssets = { ...assetIntegrationPayload };
    const newUpstreamApi = "https://mock-upstream-api.com/v2";
    createWithUpdateAssets.items[0].upstreamApi = newUpstreamApi;

    const integrationResp = await request(BASE_URL)
      .post("/assets/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(createWithUpdateAssets);

    expect(integrationResp.status).toBe(200);
    expect(integrationResp.body.createdItemsCount).toBe(1);
    expect(integrationResp.body.updatedItemsCount).toBe(1);
    expect(integrationResp.body.shouldRetry).toBe(false);
    expect(integrationResp.body.message).toBe("success");

    const assetPayload1 = createWithUpdateAssets.items[0];
    const mapping1 = await prisma.externalAssetMapping.findFirstOrThrow({
      where: {
        externalId: assetPayload1.vendorId,
      },
    });

    const foundAsset1 = await prisma.asset.findFirstOrThrow({
      where: {
        id: mapping1.itemId,
      },
      include: {
        deviceGroup: true,
      },
    });

    expect(mapping1.integrationId).toBe(createdIntegration.id);
    expect(mapping1.externalId).toBe(assetPayload1.vendorId);

    expect(foundAsset1.networkSegment).toBe(assetPayload1.networkSegment);
    expect(foundAsset1.role).toBe(assetPayload1.role);
    expect(foundAsset1.upstreamApi).toBe(newUpstreamApi); // this field should be updated
    expect(foundAsset1.hostname).toBe(assetPayload1.hostname);
    expect(foundAsset1.macAddress).toBe(assetPayload1.macAddress);
    expect(foundAsset1.serialNumber).toBe(assetPayload1.serialNumber);
    expect(foundAsset1.location).toStrictEqual(assetPayload1.location);
    expect(foundAsset1.status).toBe(assetPayload1.status);
    expect(foundAsset1.deviceGroup.cpe).toBe(assetPayload1.cpe);

    const assetPayload2 = assetIntegrationPayload.items[1];
    const mapping2 = await prisma.externalAssetMapping.findFirstOrThrow({
      where: {
        externalId: assetPayload2.vendorId,
      },
    });

    const foundAsset2 = await prisma.asset.findFirstOrThrow({
      where: {
        id: mapping2.itemId,
      },
      include: {
        deviceGroup: true,
      },
    });

    expect(mapping2.integrationId).toBe(createdIntegration.id);
    expect(mapping2.externalId).toBe(assetPayload2.vendorId);

    expect(foundAsset2.networkSegment).toBe(assetPayload2.networkSegment);
    expect(foundAsset2.role).toBe(assetPayload2.role);
    expect(foundAsset2.upstreamApi).toBe(assetPayload2.upstreamApi);
    expect(foundAsset2.hostname).toBe(assetPayload2.hostname);
    expect(foundAsset2.macAddress).toBe(assetPayload2.macAddress);
    expect(foundAsset2.serialNumber).toBe(assetPayload2.serialNumber);
    expect(foundAsset2.location).toStrictEqual(assetPayload2.location);
    expect(foundAsset2.status).toBe(assetPayload2.status);
    expect(foundAsset2.deviceGroup.cpe).toBe(assetPayload2.cpe);

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

  it("asset with no mapping Assets uploadIntegration endpoint int test", async () => {
    const { integration: createdIntegration, apiKey } =
      await setupMockIntegration(mockIntegrationPayload);

    onTestFinished(async () => {
      // this won't cause an error if it misses which messes up the onTestFinished stack
      await prisma.asset.deleteMany({
        where: {
          networkSegment: {
            contains: "mock",
            mode: "insensitive" as const,
          },
          hostname: {
            contains: "mock",
            mode: "insensitive" as const,
          },
        },
      });
    });

    // create the asset directly first
    const assetData = assetIntegrationPayload.items[0];
    const createdAssetRes = await request(BASE_URL)
      .post("/assets")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(assetData);

    // no mapping should exist yet
    const noMapping = await prisma.externalAssetMapping.findFirst({
      where: {
        itemId: createdAssetRes.body.id,
      },
    });

    expect(noMapping).toBe(null);

    // setup an update for the asset
    const updatedAsset = assetIntegrationPayload.items[0];
    const newUpstreamApi = "https://mock-upstream-api.com/v2";
    updatedAsset.upstreamApi = newUpstreamApi;
    const updateAssetPayload = {
      ...assetIntegrationPayload,
      items: [updatedAsset],
    };

    // then run the endpoint which should update the asset and create the mapping
    const updateAssetResp = await request(BASE_URL)
      .post("/assets/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(updateAssetPayload);

    expect(updateAssetResp.status).toBe(200);
    expect(updateAssetResp.body.shouldRetry).toBe(false);
    expect(updateAssetResp.body.message).toBe("success");
    expect(updateAssetResp.body.createdItemsCount).toBe(0);
    expect(updateAssetResp.body.updatedItemsCount).toBe(1);

    const mapping1 = await prisma.externalAssetMapping.findFirstOrThrow({
      where: {
        externalId: updatedAsset.vendorId,
      },
    });

    const foundAsset1 = await prisma.asset.findFirstOrThrow({
      where: {
        id: mapping1.itemId,
      },
      include: {
        deviceGroup: true,
      },
    });

    expect(mapping1.itemId).toBe(foundAsset1.id);
    expect(mapping1.integrationId).toBe(createdIntegration.id);
    expect(mapping1.externalId).toBe(updatedAsset.vendorId);

    expect(foundAsset1.networkSegment).toBe(updatedAsset.networkSegment);
    expect(foundAsset1.role).toBe(updatedAsset.role);
    expect(foundAsset1.upstreamApi).toBe(updatedAsset.upstreamApi); // this field should be updated
    expect(foundAsset1.hostname).toBe(updatedAsset.hostname);
    expect(foundAsset1.macAddress).toBe(updatedAsset.macAddress);
    expect(foundAsset1.serialNumber).toBe(updatedAsset.serialNumber);
    expect(foundAsset1.location).toStrictEqual(updatedAsset.location);
    expect(foundAsset1.status).toBe(updatedAsset.status);
    expect(foundAsset1.deviceGroup.cpe).toBe(updatedAsset.cpe);

    if (!mapping1.lastSynced) {
      fail("lastSynced value should not be null");
    }

    const foundSync = await prisma.syncStatus.findFirstOrThrow({
      where: { syncedAt: mapping1.lastSynced },
    });

    expect(foundSync.integrationId).toBe(createdIntegration.id);
    expect(foundSync.status).toBe(SyncStatusEnum.Success);
    expect(foundSync.errorMessage).toBeNullable();
    expect(foundSync.syncedAt).toStrictEqual(mapping1.lastSynced);
  });

  it("all null unique field should miss Asset uploadIntegration endpoint int test", async () => {
    const { apiKey } = await setupMockIntegration(mockIntegrationPayload);

    onTestFinished(async () => {
      // this won't throw errors if it misses, which messes up the onTestFinished stack
      await prisma.asset.deleteMany({
        where: {
          OR: [
            {
              networkSegment: {
                contains: "mock",
                mode: "insensitive" as const,
              },
            },
            {
              hostname: {
                contains: "mock",
                mode: "insensitive" as const,
              },
            },
          ],
        },
      });
    });

    // create our unfindable asset by overriding all unique fields
    const createdAssetRes = await request(BASE_URL)
      .post("/assets")
      .set(authHeader)
      .set(jsonHeader)
      .send({
        ...assetIntegrationPayload.items[0],
        hostname: undefined,
        macAddress: undefined,
        serialNumber: undefined,
      });

    const foundAsset = await prisma.asset.findFirstOrThrow({
      where: {
        id: createdAssetRes.body.id,
      },
    });

    expect(foundAsset.hostname).toBeNullable();
    expect(foundAsset.macAddress).toBeNullable();
    expect(foundAsset.serialNumber).toBeNullable();

    const unmatchableAsset = {
      ...assetIntegrationPayload.items[0],
      hostname: undefined,
      macAddress: undefined,
      serialNumber: undefined,
    };

    // this should create a new asset because all unique fields are missing
    const integrationRes = await request(BASE_URL)
      .post("/assets/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send({
        ...assetIntegrationPayload,
        items: [unmatchableAsset],
      });

    expect(integrationRes.status).toBe(200);
    expect(integrationRes.body.createdItemsCount).toBe(1);
    expect(integrationRes.body.updatedItemsCount).toBe(0);
    expect(integrationRes.body.shouldRetry).toBe(false);
    expect(integrationRes.body.message).toBe("success");
  });

  it("partial null unique field shouldn't miss Asset uploadIntegration endpoint int test", async () => {
    const { apiKey } = await setupMockIntegration(mockIntegrationPayload);

    onTestFinished(async () => {
      // this won't throw errors if it misses, which messes up the onTestFinished stack
      await prisma.asset.deleteMany({
        where: {
          OR: [
            {
              networkSegment: {
                contains: "mock",
                mode: "insensitive" as const,
              },
            },
            {
              hostname: {
                contains: "mock",
                mode: "insensitive" as const,
              },
            },
          ],
        },
      });
    });

    const newUpstreamApi = "https://mock-upstream-api.com/v2";

    // create our unfindable asset by overriding all unique fields
    const createdAssetRes = await request(BASE_URL)
      .post("/assets")
      .set(authHeader)
      .set(jsonHeader)
      .send({
        ...assetIntegrationPayload.items[0],
        hostname: undefined,
        macAddress: undefined,
      });

    const matchableAsset = {
      ...assetIntegrationPayload.items[0],
      hostname: undefined,
      macAddress: undefined,
      upstreamApi: newUpstreamApi,
    };

    // this should produce an update based on serialNumber match
    const integrationRes = await request(BASE_URL)
      .post("/assets/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send({
        ...assetIntegrationPayload,
        items: [matchableAsset],
      });

    expect(integrationRes.status).toBe(200);
    expect(integrationRes.body.createdItemsCount).toBe(0);
    expect(integrationRes.body.updatedItemsCount).toBe(1);
    expect(integrationRes.body.shouldRetry).toBe(false);
    expect(integrationRes.body.message).toBe("success");

    const foundAsset = await prisma.asset.findFirstOrThrow({
      where: {
        id: createdAssetRes.body.id,
      },
    });

    expect(foundAsset.networkSegment).toBe(matchableAsset.networkSegment);
    expect(foundAsset.role).toBe(matchableAsset.role);
    expect(foundAsset.upstreamApi).toBe(matchableAsset.upstreamApi); // this should be updated
    expect(foundAsset.hostname).toBeNullable();
    expect(foundAsset.macAddress).toBeNullable();
    expect(foundAsset.serialNumber).toBe(matchableAsset.serialNumber);
    expect(foundAsset.location).toStrictEqual(matchableAsset.location);
    expect(foundAsset.status).toBe(matchableAsset.status);
  });
});
