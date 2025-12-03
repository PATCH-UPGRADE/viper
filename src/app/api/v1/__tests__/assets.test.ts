import request from "supertest";
import { BASE_URL, AUTH_TOKEN, generateCPE, TestState } from "./test-config";

describe("Assets Endpoint (/assets)", () => {
  const authHeader = { Authorization: AUTH_TOKEN };

  const payload = {
    ip: "192.168.1.100",
    cpe: generateCPE("asset_v1"),
    role: "Primary Server",
    upstreamApi: "https://api.hospital-upstream.com/v1",
  };

  it("POST /assets - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).post("/assets").send(payload);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("POST /assets - Should create a new asset", async () => {
    const res = await request(BASE_URL)
      .post("/assets")
      .set(authHeader)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body.ip).toBe(payload.ip);

    TestState.assetId = res.body.id; // Store ID for subsequent tests
  });

  it("GET /assets - Should list assets", async () => {
    const res = await request(BASE_URL)
      .get("/assets")
      .query({ page: 1, pageSize: 5 })
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("GET /assets - Without auth, should be 401", async () => {
    const res = await request(BASE_URL)
      .get("/assets")
      .query({ page: 1, pageSize: 5 });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /assets/{id} - Should get the specific asset", async () => {
    expect(TestState.assetId).toBeDefined();

    const res = await request(BASE_URL)
      .get(`/assets/${TestState.assetId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TestState.assetId);
  });

  it("GET /assets/{id} - Without auth, should be 401", async () => {
    expect(TestState.assetId).toBeDefined();

    const res = await request(BASE_URL).get(`/assets/${TestState.assetId}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("PUT /assets/{id} - Should update the asset", async () => {
    expect(TestState.assetId).toBeDefined();

    const updatePayload = {
      ip: "192.168.1.105", // Updated field
      cpe: generateCPE("asset_v1"),
      role: "Backup Server",
      upstreamApi: "https://api.hospital-upstream.com/v1",
    };

    const res = await request(BASE_URL)
      .put(`/assets/${TestState.assetId}`)
      .set(authHeader)
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("Backup Server");
  });

  it("DELETE /assets/{id} - Should delete the asset (Cleanup after dependent tests run)", async () => {
    expect(TestState.assetId).toBeDefined();

    const res = await request(BASE_URL)
      .delete(`/assets/${TestState.assetId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    TestState.assetId = undefined; // Clear state
  });
});
