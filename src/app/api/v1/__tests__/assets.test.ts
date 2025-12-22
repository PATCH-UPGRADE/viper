import request from "supertest";
import { AUTH_TOKEN, BASE_URL, generateCPE } from "./test-config";

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
});
