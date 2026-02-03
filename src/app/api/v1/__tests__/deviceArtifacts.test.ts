import request from "supertest";
import { describe, expect, it } from "vitest";
import { BASE_URL } from "./test-config";

describe("Device Artifacts Endpoint (/deviceArtifacts)", () => {
  it("GET /deviceArtifacts - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).get("/deviceArtifacts");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});
