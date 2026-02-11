import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import { ArtifactType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { authHeader, BASE_URL, generateCPE } from "./test-config";

describe("Artifacts Endpoint (/artifacts)", () => {
  // Helper function to create a remediation with artifacts for testing
  const createRemediationWithArtifacts = async () => {
    const payload = {
      cpes: [generateCPE("artifact_test")],
      description: "Test remediation for artifact testing",
      narrative: "Used to test artifact endpoints",
      artifacts: [
        {
          name: "Initial Version",
          artifactType: ArtifactType.Firmware,
          downloadUrl: "https://example.com/firmware/v1.0.0.bin",
          size: 1024000,
        },
      ],
    };

    const res = await request(BASE_URL)
      .post("/remediations")
      .set(authHeader)
      .send(payload);

    return res.body;
  };

  it("GET /artifacts/{id} - Without auth, should 401", async () => {
    const res = await request(BASE_URL).get("/artifacts/foo");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /artifacts/versions/{wrapperId} - Without auth, should 401", async () => {
    const res = await request(BASE_URL).get("/artifacts/versions/foo");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("PUT /artifacts/{id} - Without auth, should 401", async () => {
    const res = await request(BASE_URL)
      .put("/artifacts/foo")
      .send({ name: "updated" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("POST /artifacts/versions/{wrapperId} - Without auth, should 401", async () => {
    const res = await request(BASE_URL).post("/artifacts/versions/foo").send({
      wrapperId: "foo",
      artifactType: ArtifactType.Firmware,
      downloadUrl: "https://example.com/test.bin",
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("GET /artifacts/{id} - Get single artifact", async () => {
    const remediation = await createRemediationWithArtifacts();

    onTestFinished(async () => {
      await prisma.remediation
        .delete({ where: { id: remediation.id } })
        .catch(() => {
          /* already deleted */
        });
    });

    const artifactId = remediation.artifacts[0].latestArtifact.id;

    const res = await request(BASE_URL)
      .get(`/artifacts/${artifactId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(artifactId);
    expect(res.body.name).toBe("Initial Version");
    expect(res.body.artifactType).toBe(ArtifactType.Firmware);
    expect(res.body.versionNumber).toBe(1);
    expect(res.body).toHaveProperty("downloadUrl");
    expect(res.body).toHaveProperty("url");
  });

  it("GET /artifacts/versions/{wrapperId} - List all versions", async () => {
    const remediation = await createRemediationWithArtifacts();

    onTestFinished(async () => {
      await prisma.remediation
        .delete({ where: { id: remediation.id } })
        .catch(() => {
          /* already deleted */
        });
    });

    const wrapperId = remediation.artifacts[0].id;

    const res = await request(BASE_URL)
      .get(`/artifacts/versions/${wrapperId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].versionNumber).toBe(1);
  });

  it("PUT /artifacts/{id} - Update artifact metadata", async () => {
    const remediation = await createRemediationWithArtifacts();

    onTestFinished(async () => {
      await prisma.remediation
        .delete({ where: { id: remediation.id } })
        .catch(() => {
          /* already deleted */
        });
    });

    const artifactId = remediation.artifacts[0].latestArtifact.id;

    const updateRes = await request(BASE_URL)
      .put(`/artifacts/${artifactId}`)
      .set(authHeader)
      .send({
        id: artifactId,
        name: "Updated Name",
        size: 2048000,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.id).toBe(artifactId);
    expect(updateRes.body.name).toBe("Updated Name");
    expect(updateRes.body.size).toBe(2048000);
    expect(updateRes.body.artifactType).toBe(ArtifactType.Firmware); // unchanged
  });

  it("POST /artifacts/versions/{wrapperId} - Create new version", async () => {
    const remediation = await createRemediationWithArtifacts();

    onTestFinished(async () => {
      await prisma.remediation
        .delete({ where: { id: remediation.id } })
        .catch(() => {
          /* already deleted */
        });
    });

    const wrapperId = remediation.artifacts[0].id;
    const originalArtifactId = remediation.artifacts[0].latestArtifact.id;

    // Create version 2
    const createV2Res = await request(BASE_URL)
      .post(`/artifacts/versions/${wrapperId}`)
      .set(authHeader)
      .send({
        wrapperId,
        name: "Version 2.0.0",
        artifactType: ArtifactType.Firmware,
        downloadUrl: "https://example.com/firmware/v2.0.0.bin",
        size: 1536000,
      });

    expect(createV2Res.status).toBe(200);
    expect(createV2Res.body.versionNumber).toBe(2);
    expect(createV2Res.body.name).toBe("Version 2.0.0");
    expect(createV2Res.body.prevVersionId).toBe(originalArtifactId);

    // Verify wrapper now points to v2 as latest
    const wrapperRes = await request(BASE_URL)
      .get(`/remediations/${remediation.id}`)
      .set(authHeader);

    expect(wrapperRes.body.artifacts[0].latestArtifact.id).toBe(
      createV2Res.body.id,
    );
    expect(wrapperRes.body.artifacts[0].latestArtifact.versionNumber).toBe(2);

    // Verify we can still access v1
    const v1Res = await request(BASE_URL)
      .get(`/artifacts/${originalArtifactId}`)
      .set(authHeader);

    expect(v1Res.status).toBe(200);
    expect(v1Res.body.versionNumber).toBe(1);
  });

  it("GET /artifacts/versions/{wrapperId} - Pagination test", async () => {
    const remediation = await createRemediationWithArtifacts();

    onTestFinished(async () => {
      await prisma.remediation
        .delete({ where: { id: remediation.id } })
        .catch(() => {
          /* already deleted */
        });
    });

    const wrapperId = remediation.artifacts[0].id;

    // Create 5 more versions (total of 6 including initial)
    for (let i = 2; i <= 6; i++) {
      await request(BASE_URL)
        .post(`/artifacts/versions/${wrapperId}`)
        .set(authHeader)
        .send({
          wrapperId,
          name: `Version ${i}.0.0`,
          artifactType: ArtifactType.Firmware,
          downloadUrl: `https://example.com/firmware/v${i}.0.0.bin`,
        });
    }

    // Test pagination
    const page1Res = await request(BASE_URL)
      .get(`/artifacts/versions/${wrapperId}?page=1&pageSize=3`)
      .set(authHeader);

    expect(page1Res.status).toBe(200);
    expect(page1Res.body.items.length).toBe(3);
    expect(page1Res.body).toHaveProperty("totalCount");
    expect(page1Res.body.totalCount).toBe(6);
    expect(page1Res.body).toHaveProperty("pageSize");
    expect(page1Res.body.pageSize).toBe(3);

    const page2Res = await request(BASE_URL)
      .get(`/artifacts/versions/${wrapperId}?page=2&pageSize=3`)
      .set(authHeader);

    expect(page2Res.status).toBe(200);
    expect(page2Res.body.items.length).toBe(3);
  });

  it("POST /artifacts/versions/{wrapperId} - Different artifact types in version chain", async () => {
    const remediation = await createRemediationWithArtifacts();

    onTestFinished(async () => {
      await prisma.remediation
        .delete({ where: { id: remediation.id } })
        .catch(() => {
          /* already deleted */
        });
    });

    const wrapperId = remediation.artifacts[0].id;

    // Create v2 as Documentation (different type)
    const createV2Res = await request(BASE_URL)
      .post(`/artifacts/versions/${wrapperId}`)
      .set(authHeader)
      .send({
        wrapperId,
        name: "User Manual v2",
        artifactType: ArtifactType.Documentation,
        downloadUrl: "https://example.com/docs/manual-v2.pdf",
      });

    expect(createV2Res.status).toBe(200);
    expect(createV2Res.body.artifactType).toBe(ArtifactType.Documentation);
    expect(createV2Res.body.versionNumber).toBe(2);

    // Create v3 as Binary
    const createV3Res = await request(BASE_URL)
      .post(`/artifacts/versions/${wrapperId}`)
      .set(authHeader)
      .send({
        wrapperId,
        name: "Binary Package v3",
        artifactType: ArtifactType.Binary,
        downloadUrl: "https://example.com/binaries/v3.zip",
      });

    expect(createV3Res.status).toBe(200);
    expect(createV3Res.body.artifactType).toBe(ArtifactType.Binary);
    expect(createV3Res.body.versionNumber).toBe(3);

    // List all versions to verify types
    const listRes = await request(BASE_URL)
      .get(`/artifacts/versions/${wrapperId}`)
      .set(authHeader);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items.length).toBe(3);

    const types = listRes.body.items.map((item: any) => item.artifactType);
    expect(types).toContain(ArtifactType.Firmware);
    expect(types).toContain(ArtifactType.Documentation);
    expect(types).toContain(ArtifactType.Binary);
  });

  it("PUT /artifacts/{id} - Update artifact type", async () => {
    const remediation = await createRemediationWithArtifacts();

    onTestFinished(async () => {
      await prisma.remediation
        .delete({ where: { id: remediation.id } })
        .catch(() => {
          /* already deleted */
        });
    });

    const artifactId = remediation.artifacts[0].latestArtifact.id;

    const updateRes = await request(BASE_URL)
      .put(`/artifacts/${artifactId}`)
      .set(authHeader)
      .send({
        id: artifactId,
        artifactType: ArtifactType.Binary,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.artifactType).toBe(ArtifactType.Binary);
    expect(updateRes.body.name).toBe("Initial Version"); // unchanged
  });

  it("POST /artifacts/versions/{wrapperId} - Versions have correct versionsCount in wrapper", async () => {
    const remediation = await createRemediationWithArtifacts();

    onTestFinished(async () => {
      await prisma.remediation
        .delete({ where: { id: remediation.id } })
        .catch(() => {
          /* already deleted */
        });
    });

    const wrapperId = remediation.artifacts[0].id;

    // Initial state - should have 1 version
    let wrapperRes = await request(BASE_URL)
      .get(`/remediations/${remediation.id}`)
      .set(authHeader);

    expect(wrapperRes.body.artifacts[0].versionsCount).toBe(1);

    // Create v2
    await request(BASE_URL)
      .post(`/artifacts/versions/${wrapperId}`)
      .set(authHeader)
      .send({
        wrapperId,
        artifactType: ArtifactType.Firmware,
        downloadUrl: "https://example.com/v2.bin",
      });

    wrapperRes = await request(BASE_URL)
      .get(`/remediations/${remediation.id}`)
      .set(authHeader);

    expect(wrapperRes.body.artifacts[0].versionsCount).toBe(2);

    // Create v3
    await request(BASE_URL)
      .post(`/artifacts/versions/${wrapperId}`)
      .set(authHeader)
      .send({
        wrapperId,
        artifactType: ArtifactType.Firmware,
        downloadUrl: "https://example.com/v3.bin",
      });

    wrapperRes = await request(BASE_URL)
      .get(`/remediations/${remediation.id}`)
      .set(authHeader);

    expect(wrapperRes.body.artifacts[0].versionsCount).toBe(3);
  });
});
