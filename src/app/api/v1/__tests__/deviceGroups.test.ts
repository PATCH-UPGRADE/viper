import request from "supertest";
import { describe, expect, it } from "vitest";
import { AUTH_TOKEN, BASE_URL, generateCPE } from "./test-config";

describe("Device Groups Endpoint (/deviceGroups)", () => {
  const authHeader = { Authorization: AUTH_TOKEN };

  const assetPayload = {
    ip: "192.168.1.100",
    cpe: generateCPE("asset_v1"),
    role: "Primary Server",
    upstreamApi: "https://api.hospital-upstream.com/v1",
  };

  it("GET /deviceGroups - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL)
      .get("/deviceGroups")
      .query({ page: 1, pageSize: 5 });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /deviceGroups/{id} - Without auth, should be 401", async () => {
    const res = await request(BASE_URL).get(`/deviceGroups/foo`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /deviceGroups - Should return paginated results", async () => {
    // First, post an asset, which should create a device group (if one doesn't exist already)
    const assetRes = await request(BASE_URL)
      .post("/assets")
      .set(authHeader)
      .send(assetPayload);
    expect(assetRes.status).toBe(200);
    expect(assetRes.body).toHaveProperty("deviceGroup");

    const res = await request(BASE_URL)
      .get("/deviceGroups")
      .query({ page: 1, pageSize: 10 })
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items[0]).toHaveProperty("id");
    expect(res.body).toHaveProperty("totalCount");
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("pageSize");
    expect(res.body).toHaveProperty("totalPages");
  });

  it("Device Groups integration test - Get list and detail", async () => {
    // First, post an asset, which should create a device group (if one doesn't exist already)
    const assetRes = await request(BASE_URL)
      .post("/assets")
      .set(authHeader)
      .send(assetPayload);
    expect(assetRes.status).toBe(200);
    expect(assetRes.body).toHaveProperty("deviceGroup");
    const assetDeviceGroupId = assetRes.body.deviceGroup.id;

    // First, get a list of device groups
    const listRes = await request(BASE_URL)
      .get("/deviceGroups")
      .query({ page: 1, pageSize: 10 })
      .set(authHeader);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.items)).toBe(true);

    // If there are any device groups, test getting a single one
    if (listRes.body.items.length > 0) {
      const deviceGroup = listRes.body.items[0];
      expect(deviceGroup).toHaveProperty("id");
      expect(deviceGroup).toHaveProperty("cpe");
      expect(deviceGroup).toHaveProperty("url");
      expect(deviceGroup).toHaveProperty("sbomUrl");
      expect(deviceGroup).toHaveProperty("vulnerabilitiesUrl");
      expect(deviceGroup).toHaveProperty("assetsUrl");
      expect(deviceGroup).toHaveProperty("emulatorsUrl");
      const deviceGroupId = deviceGroup.id;

      // Get the specific device group
      const detailRes = await request(BASE_URL)
        .get(`/deviceGroups/${deviceGroupId}`)
        .set(authHeader);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.id).toBe(deviceGroupId);
      expect(detailRes.body.cpe).toBe(deviceGroup.cpe);
      expect(detailRes.body).toHaveProperty("url");
      expect(detailRes.body).toHaveProperty("sbomUrl");
      expect(detailRes.body).toHaveProperty("vulnerabilitiesUrl");
      expect(detailRes.body).toHaveProperty("assetsUrl");
      expect(detailRes.body).toHaveProperty("emulatorsUrl");
    }

    // check the asset device group
    const detailRes = await request(BASE_URL)
      .get(`/deviceGroups/${assetDeviceGroupId}`)
      .set(authHeader);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.id).toBe(assetDeviceGroupId);
    expect(detailRes.body.cpe).toBe(assetPayload.cpe);
  });
});
