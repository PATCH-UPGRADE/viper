import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import { ArtifactType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { authHeader, BASE_URL, generateCPE } from "./test-config";

describe("Aloha Endpoints", () => {
  const vulnPayload = {
    sarif: { tool: { driver: { name: "TestScanner" } } },
    cpes: [generateCPE("aloha_vuln_v1")],
    description: "Mock -- Aloha test vulnerability",
  };

  const remPayload = {
    cpes: [generateCPE("aloha_rem_v1")],
    description: "Mock -- Aloha test remediation",
    artifacts: [
      {
        name: "Aloha patch",
        artifactType: ArtifactType.Firmware,
        downloadUrl: "https://vendor.example.com/aloha-patch.bin",
      },
    ],
  };

  describe("Vulnerability Aloha (/vulnerabilities/{id}/aloha)", () => {
    it("GET without auth returns 401", async () => {
      const res = await request(BASE_URL).get(
        "/vulnerabilities/nonexistent/aloha",
      );
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    });

    it("PUT without auth returns 401", async () => {
      const res = await request(BASE_URL)
        .put("/vulnerabilities/nonexistent/aloha")
        .send({ data: { status: "Confirmed" } });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    });

    it("GET/PUT aloha integration test", async () => {
      const createRes = await request(BASE_URL)
        .post("/vulnerabilities")
        .set(authHeader)
        .send(vulnPayload);

      expect(createRes.status).toBe(200);
      const vulnId = createRes.body.id;

      onTestFinished(async () => {
        await prisma.vulnerability
          .delete({ where: { id: vulnId } })
          .catch(() => {});
      });

      // GET aloha - default state
      const getDefault = await request(BASE_URL)
        .get(`/vulnerabilities/${vulnId}/aloha`)
        .set(authHeader);

      expect(getDefault.status).toBe(200);
      expect(getDefault.body).toHaveProperty("vulnerability");
      expect(getDefault.body).toHaveProperty("aloha");
      expect(getDefault.body.vulnerability.id).toBe(vulnId);
      expect(getDefault.body.aloha.status).toBeNull();
      expect(getDefault.body.aloha.log).toEqual({});

      // PUT aloha - update to Confirmed
      const putRes = await request(BASE_URL)
        .put(`/vulnerabilities/${vulnId}/aloha`)
        .set(authHeader)
        .send({ data: { status: "Confirmed", log: { note: "verified" } } });

      expect(putRes.status).toBe(200);
      expect(putRes.body.vulnerability.id).toBe(vulnId);
      expect(putRes.body.aloha.status).toBe("Confirmed");
      expect(putRes.body.aloha.log).toEqual({ note: "verified" });

      // GET aloha - reflects update
      const getUpdated = await request(BASE_URL)
        .get(`/vulnerabilities/${vulnId}/aloha`)
        .set(authHeader);

      expect(getUpdated.status).toBe(200);
      expect(getUpdated.body.aloha.status).toBe("Confirmed");
      expect(getUpdated.body.aloha.log).toEqual({ note: "verified" });
    });
  });

  describe("Remediation Aloha (/remediations/{id}/aloha)", () => {
    it("GET without auth returns 401", async () => {
      const res = await request(BASE_URL).get(
        "/remediations/nonexistent/aloha",
      );
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    });

    it("PUT without auth returns 401", async () => {
      const res = await request(BASE_URL)
        .put("/remediations/nonexistent/aloha")
        .send({ data: { status: "Unsure" } });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHORIZED");
    });

    it("GET/PUT aloha integration test", async () => {
      const createRes = await request(BASE_URL)
        .post("/remediations")
        .set(authHeader)
        .send(remPayload);

      expect(createRes.status).toBe(200);
      const remId = createRes.body.remediation.id;

      onTestFinished(async () => {
        await prisma.remediation
          .delete({ where: { id: remId } })
          .catch(() => {});
      });

      // GET aloha - default state
      const getDefault = await request(BASE_URL)
        .get(`/remediations/${remId}/aloha`)
        .set(authHeader);

      expect(getDefault.status).toBe(200);
      expect(getDefault.body).toHaveProperty("remediation");
      expect(getDefault.body).toHaveProperty("aloha");
      expect(getDefault.body.remediation.id).toBe(remId);
      expect(getDefault.body.aloha.status).toBeNull();
      expect(getDefault.body.aloha.log).toEqual({});

      // PUT aloha - update to Unsure
      const putRes = await request(BASE_URL)
        .put(`/remediations/${remId}/aloha`)
        .set(authHeader)
        .send({
          data: { status: "Unsure", log: { reason: "needs review" } },
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.remediation.id).toBe(remId);
      expect(putRes.body.aloha.status).toBe("Unsure");
      expect(putRes.body.aloha.log).toEqual({ reason: "needs review" });

      // GET aloha - reflects update
      const getUpdated = await request(BASE_URL)
        .get(`/remediations/${remId}/aloha`)
        .set(authHeader);

      expect(getUpdated.status).toBe(200);
      expect(getUpdated.body.aloha.status).toBe("Unsure");
      expect(getUpdated.body.aloha.log).toEqual({ reason: "needs review" });
    });
  });
});
