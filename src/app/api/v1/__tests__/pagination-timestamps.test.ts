import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import prisma from "@/lib/db";
import { authHeader, BASE_URL, generateCPE } from "./test-config";

describe("Pagination timestamp filters (GET /vulnerabilities)", () => {
  const vulnPayload1 = {
    sarif: { tool: { driver: { name: "TestScanner" } } },
    cpes: [generateCPE("pag_ts_v1")],
    description: "Mock -- Pagination timestamp test vulnerability 1",
  };

  const vulnPayload2 = {
    sarif: { tool: { driver: { name: "TestScanner" } } },
    cpes: [generateCPE("pag_ts_v2")],
    description: "Mock -- Pagination timestamp test vulnerability 2",
  };

  it("filters by lastUpdatedStartTime and lastUpdatedEndTime", async () => {
    const create1 = await request(BASE_URL)
      .post("/vulnerabilities")
      .set(authHeader)
      .send(vulnPayload1);
    expect(create1.status).toBe(200);
    const vuln1Id = create1.body.id;

    const create2 = await request(BASE_URL)
      .post("/vulnerabilities")
      .set(authHeader)
      .send(vulnPayload2);
    expect(create2.status).toBe(200);
    const vuln2Id = create2.body.id;

    onTestFinished(async () => {
      await prisma.vulnerability.deleteMany({
        where: { id: { in: [vuln1Id, vuln2Id] } },
      });
    });

    const afterCreation = Date.now();

    const updateRes = await request(BASE_URL)
      .put(`/vulnerabilities/${vuln2Id}`)
      .set(authHeader)
      .send({
        data: {
          ...vulnPayload2,
          description: "Mock -- Pagination timestamp test vulnerability 2 (updated)",
        },
      });
    expect(updateRes.status).toBe(200);

    const listWithStart = await request(BASE_URL)
      .get("/vulnerabilities")
      .query({
        page: 1,
        pageSize: 100,
        lastUpdatedStartTime: afterCreation,
      })
      .set(authHeader);

    expect(listWithStart.status).toBe(200);
    expect(listWithStart.body).toHaveProperty("items");
    const idsWithStart = listWithStart.body.items.map((v: { id: string }) => v.id);
    expect(idsWithStart).toContain(vuln2Id);
    expect(idsWithStart).not.toContain(vuln1Id);

    const listWithEnd = await request(BASE_URL)
      .get("/vulnerabilities")
      .query({
        page: 1,
        pageSize: 100,
        lastUpdatedEndTime: afterCreation - 1,
      })
      .set(authHeader);

    expect(listWithEnd.status).toBe(200);
    expect(listWithEnd.body).toHaveProperty("items");
    const idsWithEnd = listWithEnd.body.items.map((v: { id: string }) => v.id);
    expect(idsWithEnd).not.toContain(vuln2Id);
  });
});
