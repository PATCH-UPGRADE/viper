import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import type { ArtifactWrapperWithUrls } from "@/features/artifacts/types";
import type { DeviceGroupWithUrls } from "@/features/device-groups/types";
import type { RemediationResponse } from "@/features/remediations/types";
import { ArtifactType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { authHeader, BASE_URL, generateCPE } from "./test-config";

describe("Remediations Endpoint (/remediations)", () => {
  const payload = {
    cpes: [generateCPE("rem_v1")],
    description: "Mock -- Firmware update to fix vulnerability",
    narrative: "Apply the latest firmware patch to resolve the issue.",
    upstreamApi: "https://vendor.example.com/patches",
    artifacts: [
      {
        name: "Firmware v2.1.0",
        artifactType: ArtifactType.Firmware,
        downloadUrl: "https://vendor.example.com/firmware/v2.1.0.bin",
        size: 1024000,
      },
    ],
  };

  const vulnerabilityPayload = {
    sarif: { tool: { driver: { name: "TestScanner" } } },
    cpes: [generateCPE("rem_v1")],
    exploitUri: "https://exploit-db.com/5678",
    upstreamApi: "https://nvd.nist.gov/api",
    description: "Mock -- Critical vulnerability requiring remediation",
    narrative: "Found during security audit.",
    impact: "Critical",
  };

  it("POST /remediations - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).post("/remediations").send(payload);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /remediations - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL).get("/remediations");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /remediations/{id} - Without auth, should 401", async () => {
    const res = await request(BASE_URL).get("/remediations/foo");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("PUT /remediations/{id} - Without auth, should 401", async () => {
    const res = await request(BASE_URL)
      .put("/remediations/foo")
      .send({ description: "updated" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("DELETE /remediations/{id} - Without auth, should 401", async () => {
    const res = await request(BASE_URL).delete("/remediations/foo");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("POST /remediations - Create remediation without artifacts should fail", async () => {
    const invalidPayload = {
      cpes: [generateCPE("rem_v1")],
      description: "No artifacts",
      artifacts: [],
    };

    const res = await request(BASE_URL)
      .post("/remediations")
      .set(authHeader)
      .send(invalidPayload);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  it("POST /remediations - Create remediation without cpes should fail", async () => {
    const invalidPayload = {
      cpes: [],
      description: "No CPEs",
      artifacts: [
        {
          name: "Test artifact",
          artifactType: ArtifactType.Firmware,
          downloadUrl: "https://example.com/file.bin",
        },
      ],
    };

    const res = await request(BASE_URL)
      .post("/remediations")
      .set(authHeader)
      .send(invalidPayload);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  it("/remediations - Full CRUD integration test", async () => {
    // Create a remediation
    const createRes = await request(BASE_URL)
      .post("/remediations")
      .set(authHeader)
      .send(payload);

    expect(createRes.status).toBe(200);
    expect(createRes.body).toHaveProperty("id");
    const remediationId = createRes.body.id;

    onTestFinished(async () => {
      // Cleanup - delete the remediation (which cascades to artifacts)
      await prisma.remediation
        .delete({
          where: { id: remediationId },
        })
        .catch(() => {
          /* already deleted */
        });
    });

    // Verify the response structure
    expect(createRes.body).toHaveProperty("affectedDeviceGroups");
    expect(Array.isArray(createRes.body.affectedDeviceGroups)).toBe(true);
    expect(createRes.body.affectedDeviceGroups.length).toBe(1);
    expect(createRes.body.affectedDeviceGroups[0]).toEqual(
      expect.objectContaining({ cpe: payload.cpes[0] }),
    );

    expect(createRes.body).toHaveProperty("artifacts");
    expect(Array.isArray(createRes.body.artifacts)).toBe(true);
    expect(createRes.body.artifacts.length).toBe(1);
    expect(createRes.body.artifacts[0]).toHaveProperty("latestArtifact");
    expect(createRes.body.artifacts[0].latestArtifact).toEqual(
      expect.objectContaining({
        name: payload.artifacts[0].name,
        artifactType: payload.artifacts[0].artifactType,
        downloadUrl: payload.artifacts[0].downloadUrl,
        versionNumber: 1,
      }),
    );

    // Get single remediation
    const getOneRes = await request(BASE_URL)
      .get(`/remediations/${remediationId}`)
      .set(authHeader);

    expect(getOneRes.status).toBe(200);
    expect(getOneRes.body.id).toBe(remediationId);
    expect(getOneRes.body.description).toBe(payload.description);
    expect(getOneRes.body.narrative).toBe(payload.narrative);

    // Get list of remediations
    const getManyRes = await request(BASE_URL)
      .get("/remediations")
      .set(authHeader);

    expect(getManyRes.status).toBe(200);
    expect(getManyRes.body).toHaveProperty("items");
    expect(Array.isArray(getManyRes.body.items)).toBe(true);
    const foundRemediation = getManyRes.body.items.find(
      (r: RemediationResponse) => r.id === remediationId,
    );
    expect(foundRemediation).toBeDefined();

    // Update the remediation
    const updateRes = await request(BASE_URL)
      .put(`/remediations/${remediationId}`)
      .set(authHeader)
      .send({
        id: remediationId,
        description: "Updated description",
        narrative: "Updated narrative",
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.id).toBe(remediationId);
    expect(updateRes.body.description).toBe("Updated description");
    expect(updateRes.body.narrative).toBe("Updated narrative");

    // Update CPEs
    const newCpe = generateCPE("rem_v2");
    const updateCpesRes = await request(BASE_URL)
      .put(`/remediations/${remediationId}`)
      .set(authHeader)
      .send({
        id: remediationId,
        cpes: [payload.cpes[0], newCpe],
      });

    expect(updateCpesRes.status).toBe(200);
    expect(updateCpesRes.body.affectedDeviceGroups.length).toBe(2);
    const cpes = updateCpesRes.body.affectedDeviceGroups.map(
      (dg: DeviceGroupWithUrls) => dg.cpe,
    );
    expect(cpes).toContain(payload.cpes[0]);
    expect(cpes).toContain(newCpe);

    // Delete the remediation
    const deleteRes = await request(BASE_URL)
      .delete(`/remediations/${remediationId}`)
      .set(authHeader);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.id).toBe(remediationId);
  });

  it("POST /remediations - Create with vulnerability reference", async () => {
    // First create a vulnerability
    const vulnRes = await request(BASE_URL)
      .post("/vulnerabilities")
      .set(authHeader)
      .send(vulnerabilityPayload);

    expect(vulnRes.status).toBe(200);
    const vulnerabilityId = vulnRes.body.id;

    onTestFinished(async () => {
      await prisma.vulnerability
        .delete({
          where: { id: vulnerabilityId },
        })
        .catch(() => {
          /* already deleted */
        });
    });

    // Create remediation linked to the vulnerability
    const payloadWithVuln = {
      ...payload,
      vulnerabilityId,
    };

    const createRes = await request(BASE_URL)
      .post("/remediations")
      .set(authHeader)
      .send(payloadWithVuln);

    expect(createRes.status).toBe(200);
    expect(createRes.body.vulnerability).toBeDefined();
    expect(createRes.body.vulnerability?.id).toBe(vulnerabilityId);

    onTestFinished(async () => {
      await prisma.remediation
        .delete({
          where: { id: createRes.body.id },
        })
        .catch(() => {
          /* already deleted */
        });
    });
  });

  it("POST /remediations - Create with invalid vulnerability ID should fail", async () => {
    const payloadWithInvalidVuln = {
      ...payload,
      vulnerabilityId: "nonexistent-vuln-id",
    };

    const res = await request(BASE_URL)
      .post("/remediations")
      .set(authHeader)
      .send(payloadWithInvalidVuln);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(res.body.message).toContain("Vulnerability not found");
  });

  it("POST /remediations - Create with multiple artifacts", async () => {
    const multiArtifactPayload = {
      ...payload,
      artifacts: [
        {
          name: "Firmware v2.1.0",
          artifactType: ArtifactType.Firmware,
          downloadUrl: "https://vendor.example.com/firmware/v2.1.0.bin",
          size: 1024000,
        },
        {
          name: "Installation Guide",
          artifactType: ArtifactType.Documentation,
          downloadUrl: "https://vendor.example.com/docs/install-guide.pdf",
          size: 50000,
        },
        {
          name: "Source Code",
          artifactType: ArtifactType.Source,
          downloadUrl: "https://github.com/vendor/firmware/v2.1.0.tar.gz",
        },
      ],
    };

    const createRes = await request(BASE_URL)
      .post("/remediations")
      .set(authHeader)
      .send(multiArtifactPayload);

    expect(createRes.status).toBe(200);
    expect(createRes.body.artifacts.length).toBe(3);

    // Verify each artifact was created correctly
    const artifactTypes = createRes.body.artifacts.map(
      (wrapper: ArtifactWrapperWithUrls) => wrapper.latestArtifact.artifactType,
    );
    expect(artifactTypes).toContain(ArtifactType.Firmware);
    expect(artifactTypes).toContain(ArtifactType.Documentation);
    expect(artifactTypes).toContain(ArtifactType.Source);

    onTestFinished(async () => {
      await prisma.remediation
        .delete({
          where: { id: createRes.body.id },
        })
        .catch(() => {
          /* already deleted */
        });
    });
  });

  it("GET /remediations - Pagination test", async () => {
    // Create multiple remediations
    const createPromises = Array.from({ length: 5 }, (_, i) =>
      request(BASE_URL)
        .post("/remediations")
        .set(authHeader)
        .send({
          ...payload,
          description: `Test remediation ${i}`,
          cpes: [generateCPE(`rem_pagination_${i}`)],
        }),
    );

    const createResults = await Promise.all(createPromises);
    const remediationIds = createResults.map((r) => r.body.id);

    onTestFinished(async () => {
      await Promise.all(
        remediationIds.map((id) =>
          prisma.remediation.delete({ where: { id } }).catch(() => {
            /* already deleted */
          }),
        ),
      );
    });

    // Test pagination
    const page1Res = await request(BASE_URL)
      .get("/remediations?page=1&pageSize=2")
      .set(authHeader);

    expect(page1Res.status).toBe(200);
    expect(page1Res.body.items.length).toBeLessThanOrEqual(2);
    expect(page1Res.body).toHaveProperty("totalCount");
    expect(page1Res.body).toHaveProperty("pageSize");
    expect(page1Res.body.pageSize).toBe(2);
  });

  it("GET /remediations - Search test", async () => {
    const searchTerm = "unique-search-term-12345";
    const createRes = await request(BASE_URL)
      .post("/remediations")
      .set(authHeader)
      .send({
        ...payload,
        description: `This contains the ${searchTerm} for testing`,
      });

    expect(createRes.status).toBe(200);
    const remediationId = createRes.body.id;

    onTestFinished(async () => {
      await prisma.remediation
        .delete({
          where: { id: remediationId },
        })
        .catch(() => {
          /* already deleted */
        });
    });

    // Search for the remediation
    const searchRes = await request(BASE_URL)
      .get(`/remediations?search=${searchTerm}`)
      .set(authHeader);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.items.length).toBeGreaterThan(0);
    const found = searchRes.body.items.some(
      (r: RemediationResponse) => r.id === remediationId,
    );
    expect(found).toBe(true);
  });
});
