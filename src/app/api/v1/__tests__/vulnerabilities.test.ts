import request from "supertest";
import { describe, expect, it } from "vitest";
import { AUTH_TOKEN, BASE_URL, generateCPE } from "./test-config";

describe("Vulnerabilities Endpoint (/vulnerabilities)", () => {
  const authHeader = { Authorization: AUTH_TOKEN };

  const payload = {
    sarif: { tool: { driver: { name: "TestScanner" } } },
    cpes: [generateCPE("vuln_v1")],
    exploitUri: "https://exploit-db.com/1234",
    upstreamApi: "https://nvd.nist.gov/api",
    description: "Buffer overflow in device X",
    narrative: "Found during routine scan.",
    impact: "High",
  };

  it("POST /vulnerabilities - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).post("/vulnerabilities").send(payload);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /vulnerabilities - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).get("/vulnerabilities");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /vulnerabilities/{id} - Without auth, should 401", async () => {
    const res = await request(BASE_URL).get("/vulnerabilities/foo");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("/vulnerabilities - Integration test", async () => {
    const res = await request(BASE_URL)
      .post("/vulnerabilities")
      .set(authHeader)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    const vulnerabilityId = res.body.id;

    const detailRes = await request(BASE_URL)
      .get(`/vulnerabilities/${vulnerabilityId}`)
      .set(authHeader);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.id).toBe(vulnerabilityId);

    expect(Array.isArray(detailRes.body.affectedDeviceGroups)).toBe(true);

    // Check that the array has one element
    expect(detailRes.body.affectedDeviceGroups.length).toBe(1);

    // Check that the single object in the array has the correct .cpe value
    expect(detailRes.body.affectedDeviceGroups[0]).toEqual(
      expect.objectContaining({ cpe: payload.cpes[0] }),
    );

    const deleteRes = await request(BASE_URL)
      .delete(`/vulnerabilities/${vulnerabilityId}`)
      .set(authHeader);

    expect(deleteRes.status).toBe(200);
  });
});
