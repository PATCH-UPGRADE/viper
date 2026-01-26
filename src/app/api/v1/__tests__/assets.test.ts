import request from "supertest";
import { describe, expect, it } from "vitest";
import { AUTH_TOKEN, BASE_URL, generateCPE } from "./test-config";

describe("Assets Endpoint (/assets)", () => {
  const authHeader = { Authorization: AUTH_TOKEN };
  const jsonHeader = { "Content-Type": "application/json" };

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
    expect(bodyFirst.deviceGroup).toHaveProperty("emulatorsUrl");
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
});
