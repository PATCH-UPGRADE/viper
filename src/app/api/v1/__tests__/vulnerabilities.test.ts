import { fail } from "node:assert";
import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import { AuthType, ResourceType, SyncStatusEnum } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  authHeader,
  BASE_URL,
  generateCPE,
  jsonHeader,
  setupMockIntegration,
} from "./test-config";

describe("Vulnerabilities Endpoint (/vulnerabilities)", () => {
  const payload = {
    sarif: { tool: { driver: { name: "TestScanner" } } },
    cpes: [generateCPE("vuln_v1")],
    exploitUri: "https://exploit-db.com/1234",
    upstreamApi: "https://nvd.nist.gov/api",
    description: "Buffer overflow in device X",
    narrative: "Found during routine scan.",
    impact: "High",
  };

  const assetPayload = {
    ip: "192.168.1.100",
    cpe: generateCPE("vuln_v1"),
    role: "Primary Server",
    upstreamApi: "https://api.hospital-upstream.com/v1",
  };

  const mockIntegrationPayload = {
    name: "mockVulnIntegration",
    platform: "mockIntegrationPlatform",
    integrationUri: "https://mock-vuln-upstream-api.com/",
    isGeneric: false,
    resourceType: ResourceType.Vulnerability,
    syncEvery: 300,
    authType: AuthType.None,
  };

  const vulnerabilityIntegrationPayload = {
    vendor: "mockVulnIntegrationVendor",
    items: [
      {
        sarif: { tool: { driver: { name: "MockScanner" } } },
        cpes: ["cpe:2.3:h:mock:hispeed_ct_e:*:*:*:*:*:*:*"],
        exploitUri: "https://mock-exploit-db.com/vuln-001",
        upstreamApi: "https://mock-vuln-upstream-api.com/",
        description: "Critical buffer overflow in imaging device",
        narrative: "Discovered during security audit",
        impact: "Critical",
        vendorId: "mockVuln-1",
      },
      {
        sarif: { tool: { driver: { name: "MockScanner" } } },
        cpes: ["cpe:2.3:h:mock:brive_ct315:*:*:*:*:*:*:*"],
        exploitUri: "https://mock-exploit-db.com/vuln-002",
        upstreamApi: "https://mock-vuln-upstream-api.com/",
        description: "Authentication bypass vulnerability",
        narrative: "Found in network scan",
        impact: "High",
        vendorId: "mockVuln-2",
      },
    ],
    page: 1,
    pageSize: 100,
    totalCount: 2,
    totalPages: 1,
    next: null,
    previous: null,
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

  it("GET /vulnerabilities/integrationUpload - Without auth, should be 401", async () => {
    const res = await request(BASE_URL).get(
      `/vulnerabilities/integrationUpload`,
    );

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("/vulnerabilities - Integration test", async () => {
    const postAssetRes = await request(BASE_URL)
      .post("/assets")
      .set(authHeader)
      .send(assetPayload);

    expect(postAssetRes.status).toBe(200);
    expect(postAssetRes.body).toHaveProperty("id");

    onTestFinished(async () => {
      await prisma.asset.delete({
        where: { id: postAssetRes.body.id },
      });
    });

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

    const foundIssue = await prisma.issue.findMany({
      where: {
        vulnerabilityId: detailRes.body.id,
      },
    });

    expect(foundIssue.length).toBe(1);
    expect(foundIssue[0].assetId).toBe(postAssetRes.body.id);
    expect(foundIssue[0].vulnerabilityId).toBe(res.body.id);

    expect(Array.isArray(detailRes.body.affectedDeviceGroups)).toBe(true);

    // Check that the array has one element
    expect(detailRes.body.affectedDeviceGroups.length).toBe(1);

    // Check that the single object in the array has the correct .cpe value
    expect(detailRes.body.affectedDeviceGroups[0]).toEqual(
      expect.objectContaining({ cpe: payload.cpes[0] }),
    );
    expect(detailRes.body.affectedDeviceGroups[0]).toHaveProperty("url");

    const deleteRes = await request(BASE_URL)
      .delete(`/vulnerabilities/${vulnerabilityId}`)
      .set(authHeader);

    expect(deleteRes.status).toBe(200);
  });

  it("empty Vulnerabilities uploadIntegration endpoint int test", async () => {
    const { apiKey } = await setupMockIntegration(mockIntegrationPayload);

    // this should succeed and nothing should be created
    const noVulnerabilities = { ...vulnerabilityIntegrationPayload, items: [] };
    const createVulnResp = await request(BASE_URL)
      .post("/vulnerabilities/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(noVulnerabilities);

    expect(createVulnResp.status).toBe(200);
    expect(createVulnResp.body.createdItemsCount).toBe(0);
    expect(createVulnResp.body.updatedItemsCount).toBe(0);
    expect(createVulnResp.body.shouldRetry).toBe(false);
    expect(createVulnResp.body.message).toBe("success");
  });

  it("create Vulnerabilities uploadIntegration endpoint int test", async () => {
    const { integration: createdIntegration, apiKey } =
      await setupMockIntegration(mockIntegrationPayload);

    onTestFinished(async () => {
      // this won't throw errors if it misses, which messes up the onTestFinished stack
      await prisma.vulnerability.deleteMany({
        where: {
          description: {
            contains: "mock",
            mode: "insensitive" as const,
          },
        },
      });
    });

    const integrationRes = await request(BASE_URL)
      .post("/vulnerabilities/integrationUpload")
      .set({ Authorization: apiKey.key })
      .set(jsonHeader)
      .send(vulnerabilityIntegrationPayload);

    expect(integrationRes.status).toBe(200);
    expect(integrationRes.body.createdItemsCount).toBe(2);
    expect(integrationRes.body.updatedItemsCount).toBe(0);
    expect(integrationRes.body.shouldRetry).toBe(false);
    expect(integrationRes.body.message).toBe("success");

    const vulnPayload1 = vulnerabilityIntegrationPayload.items[0];
    const mapping1 = await prisma.externalVulnerabilityMapping.findFirstOrThrow(
      {
        where: {
          externalId: vulnPayload1.vendorId,
        },
      },
    );

    const foundVuln1 = await prisma.vulnerability.findFirstOrThrow({
      where: {
        id: mapping1.itemId,
      },
      include: {
        affectedDeviceGroups: true,
      },
    });

    expect(mapping1.integrationId).toBe(createdIntegration.id);
    expect(mapping1.externalId).toBe(vulnPayload1.vendorId);

    expect(foundVuln1.description).toBe(vulnPayload1.description);
    expect(foundVuln1.narrative).toBe(vulnPayload1.narrative);
    expect(foundVuln1.impact).toBe(vulnPayload1.impact);
    expect(foundVuln1.upstreamApi).toBe(vulnPayload1.upstreamApi);
    expect(foundVuln1.exploitUri).toBe(vulnPayload1.exploitUri);
    expect(foundVuln1.sarif).toStrictEqual(vulnPayload1.sarif);
    expect(foundVuln1.affectedDeviceGroups.length).toBe(
      vulnPayload1.cpes.length,
    );
    expect(foundVuln1.affectedDeviceGroups[0].cpe).toBe(vulnPayload1.cpes[0]);

    const vulnPayload2 = vulnerabilityIntegrationPayload.items[1];
    const mapping2 = await prisma.externalVulnerabilityMapping.findFirstOrThrow(
      {
        where: {
          externalId: vulnPayload2.vendorId,
        },
      },
    );

    const foundVuln2 = await prisma.vulnerability.findFirstOrThrow({
      where: {
        id: mapping2.itemId,
      },
      include: {
        affectedDeviceGroups: true,
      },
    });

    expect(mapping2.integrationId).toBe(createdIntegration.id);
    expect(mapping2.externalId).toBe(vulnPayload2.vendorId);

    expect(foundVuln2.description).toBe(vulnPayload2.description);
    expect(foundVuln2.narrative).toBe(vulnPayload2.narrative);
    expect(foundVuln2.impact).toBe(vulnPayload2.impact);
    expect(foundVuln2.upstreamApi).toBe(vulnPayload2.upstreamApi);
    expect(foundVuln2.exploitUri).toBe(vulnPayload2.exploitUri);
    expect(foundVuln2.sarif).toStrictEqual(vulnPayload2.sarif);
    expect(foundVuln2.affectedDeviceGroups.length).toBe(
      vulnPayload2.cpes.length,
    );
    expect(foundVuln2.affectedDeviceGroups[0].cpe).toBe(vulnPayload2.cpes[0]);

    if (!mapping1.lastSynced || !mapping2.lastSynced) {
      fail("lastSynced values should not be null");
    }

    expect(mapping1.lastSynced).toStrictEqual(mapping2.lastSynced);

    const foundSync = await prisma.syncStatus.findFirstOrThrow({
      where: { syncedAt: mapping1.lastSynced },
    });

    expect(foundSync.integrationId).toBe(createdIntegration.id);
    expect(foundSync.status).toBe(SyncStatusEnum.Success);
    expect(foundSync.errorMessage).toBeNullable();
    expect(foundSync.syncedAt).toStrictEqual(mapping2.lastSynced);
  });
});
