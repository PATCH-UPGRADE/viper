import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import prisma from "@/lib/db";
import { authHeader, BASE_URL, generateDevice } from "./test-config";

describe("Pagination timestamp filters (GET /vulnerabilities)", () => {
  const vulnPayload1 = {
    devices: [generateDevice("pag_ts_v1")],
    details: "Mock -- Pagination timestamp test vulnerability 1",
  };

  const vulnPayload2 = {
    devices: [generateDevice("pag_ts_v2")],
    details: "Mock -- Pagination timestamp test vulnerability 2",
  };

  it("filters by lastUpdatedStartTime and lastUpdatedEndTime", async () => {
    const create1 = await request(BASE_URL)
      .post("/vulnerabilityRecords")
      .set(authHeader)
      .send(vulnPayload1);
    expect(create1.status).toBe(200);
    const vuln1Id = create1.body.vulnerabilityId;

    const create2 = await request(BASE_URL)
      .post("/vulnerabilityRecords")
      .set(authHeader)
      .send(vulnPayload2);
    expect(create2.status).toBe(200);
    const vuln2Id = create2.body.vulnerabilityId;
    const record2Id = create2.body.id;

    onTestFinished(async () => {
      await prisma.vulnerability.deleteMany({
        where: { id: { in: [vuln1Id, vuln2Id] } },
      });
    });

    const afterCreation = Date.now();
    const afterCreationIso = new Date(afterCreation).toISOString();

    // Updating a record bumps its vulnerability's updatedAt.
    const updateRes = await request(BASE_URL)
      .put(`/vulnerabilityRecords/${record2Id}`)
      .set(authHeader)
      .send({
        data: {
          details:
            "Mock -- Pagination timestamp test vulnerability 2 (updated)",
        },
      });
    expect(updateRes.status).toBe(200);

    const listWithStart = await request(BASE_URL)
      .get("/vulnerabilities")
      .query({
        page: 1,
        pageSize: 100,
        lastUpdatedStartTime: afterCreationIso,
      })
      .set(authHeader);

    expect(listWithStart.status).toBe(200);
    expect(listWithStart.body).toHaveProperty("items");
    const idsWithStart = listWithStart.body.items.map(
      (v: { id: string }) => v.id,
    );
    expect(idsWithStart).toContain(vuln2Id);
    expect(idsWithStart).not.toContain(vuln1Id);

    const listWithEnd = await request(BASE_URL)
      .get("/vulnerabilities")
      .query({
        page: 1,
        pageSize: 100,
        lastUpdatedEndTime: new Date(afterCreation - 1).toISOString(),
      })
      .set(authHeader);

    expect(listWithEnd.status).toBe(200);
    expect(listWithEnd.body).toHaveProperty("items");
    const idsWithEnd = listWithEnd.body.items.map((v: { id: string }) => v.id);
    expect(idsWithEnd).not.toContain(vuln2Id);
  });
});
