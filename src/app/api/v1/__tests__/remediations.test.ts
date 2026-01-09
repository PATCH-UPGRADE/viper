import request from "supertest";
import { describe, expect, it } from "vitest";
import { BASE_URL } from "./test-config";

describe("Remediations Endpoint (/remediations)", () => {
  it("GET /remediations - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).get("/remediations");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});
