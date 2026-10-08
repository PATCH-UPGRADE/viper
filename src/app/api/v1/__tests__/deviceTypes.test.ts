import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import prisma from "@/lib/db";
import { authHeader, BASE_URL } from "./test-config";

describe("Device Types Endpoint (/deviceTypes)", () => {
  it("GET /deviceTypes - Without auth, should be 401", async () => {
    const res = await request(BASE_URL).get("/deviceTypes");

    expect(res.status).toBe(401);
  });

  it("GET /deviceTypes - counts every asset of a type but decommissioned ones", async () => {
    const stamp = Date.now();
    const deviceType = await prisma.deviceType.create({
      data: { slug: `vitest-count-${stamp}`, displayName: `Count ${stamp}` },
    });
    onTestFinished(async () => {
      await prisma.deviceType.delete({ where: { id: deviceType.id } });
    });

    const cpe = `cpe:2.3:h:vitest:device_type_count_${stamp}:1.0`;
    for (const [index, status] of [
      "Active",
      "Maintenance",
      "Decommissioned",
      undefined,
    ].entries()) {
      const res = await request(BASE_URL)
        .post("/assets")
        .set(authHeader)
        .send({
          ip: `10.0.1.${10 + index}`,
          cpe,
          deviceType: deviceType.slug,
          status,
        });
      expect(res.status).toBe(200);
      onTestFinished(async () => {
        await request(BASE_URL)
          .delete(`/assets/${res.body.id}`)
          .set(authHeader);
      });
    }

    const res = await request(BASE_URL).get("/deviceTypes").set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.items).toContainEqual({
      slug: deviceType.slug,
      displayName: deviceType.displayName,
      assetCount: 3,
    });
  });
});
