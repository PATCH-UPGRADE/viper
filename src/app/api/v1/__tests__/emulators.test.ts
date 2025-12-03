import request from "supertest";
import { BASE_URL } from "./test-config";

describe("Emulators Endpoint (/emulators)", () => {
  it("GET /emulators - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).get("/emulators");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});
