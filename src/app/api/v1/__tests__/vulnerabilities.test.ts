import { fail } from "node:assert";
import request from "supertest";
import { describe, expect, it, onTestFinished } from "vitest";
import {
  AuthType,
  PlatformEnum,
  ResourceType,
  SyncStatusEnum,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  authHeader,
  BASE_URL,
  createIntegrationToken,
  generateCPE,
  generateDevice,
  jsonHeader,
  setupMockIntegration,
} from "./test-config";

/** Delete the vulnerability a test created, with its records and Issues. */
function cleanUpVulnerability(vulnerabilityId: string) {
  onTestFinished(async () => {
    await prisma.vulnerability
      .delete({ where: { id: vulnerabilityId } })
      .catch(() => {});
  });
}

describe("Vulnerability Records Endpoint (/vulnerabilityRecords)", () => {
  const sarif = { tool: { driver: { name: "TestScanner" } } };
  const payload = {
    devices: [generateDevice("vuln_v1")],
    details: "Mock -- Buffer overflow in device X",
    metrics: [{ type: "CVSS_V3_1", score: 8.1 }],
    ta3Submission: {
      sarif,
      exploitUri: "https://exploit-db.com/1234",
      narrative: "Found during routine scan.",
      impact: "High",
    },
  };

  const assetPayload = {
    ip: "192.168.1.100",
    cpe: generateCPE("vuln_v1"),
    role: "Primary Server",
    upstreamApi: "https://api.hospital-upstream.com/v1",
  };

  const mockIntegrationPayload = {
    name: "mockVulnIntegration",
    platform: PlatformEnum.PARTNER,
    syncEvery: 300,
    config: {
      integrationUri: "https://mock-vuln-upstream-api.com/",
      resource: ResourceType.Vulnerability,
    },
    credentials: {
      authType: AuthType.None,
    },
  };

  const descDeleteKeyWord = "mock-vuln-integration-test";
  const vulnerabilityIntegrationPayload = {
    vendor: "mockVulnIntegrationVendor",
    items: [
      {
        devices: [generateDevice("vuln_integration_v10")],
        upstreamApi: "https://mock-vuln-upstream-api.com/",
        details: `${descDeleteKeyWord} -- Critical buffer overflow in imaging device`,
        ta3Submission: {
          sarif: { tool: { driver: { name: "MockScanner" } } },
          exploitUri: "https://mock-exploit-db.com/vuln-001",
          narrative: "Discovered during security audit",
          impact: "Critical",
        },
        externalId: "mockVuln-1",
      },
      {
        devices: [generateDevice("vuln_integration_v11")],
        upstreamApi: "https://mock-vuln-upstream-api.com/",
        details: `${descDeleteKeyWord} -- Authentication bypass vulnerability`,
        externalId: "mockVuln-2",
      },
    ],
    page: 1,
    pageSize: 100,
    totalCount: 2,
    totalPages: 1,
    next: null,
    previous: null,
  };

  it("POST /vulnerabilityRecords - Without auth, should get a 401", async () => {
    const res = await request(BASE_URL)
      .post("/vulnerabilityRecords")
      .send(payload);

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

  it("/vulnerabilityRecords - Integration test", async () => {
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
      .post("/vulnerabilityRecords")
      .set(authHeader)
      .send(payload);

    expect(res.status).toBe(200);
    const { id: recordId, vulnerabilityId } = res.body;
    cleanUpVulnerability(vulnerabilityId);

    // Omitted source with a TA3 submission is a TA3 record, owned by the caller.
    expect(res.body.source).toBe("TA3");
    expect(res.body.userId).not.toBeNull();
    expect(res.body.metrics).toEqual([
      expect.objectContaining({
        type: "CVSS_V3_1",
        score: 8.1,
        severity: "High",
      }),
    ]);
    expect(res.body.ta3Submission).toMatchObject({
      recordId,
      vulnerabilityId,
      sarif,
      exploitUri: payload.ta3Submission.exploitUri,
    });

    const detailRes = await request(BASE_URL)
      .get(`/vulnerabilities/${vulnerabilityId}`)
      .set(authHeader);

    expect(detailRes.status).toBe(200);
    // No identifiers given, so the vulnerability gets a VIPER ID.
    expect(detailRes.body.displayId).toMatch(/^VIPER-/);
    expect(detailRes.body.description).toBe(payload.details);

    // One issue per affected device group, not one per asset.
    const foundIssue = await prisma.issue.findMany({
      where: { vulnerabilityId },
    });
    expect(foundIssue.length).toBe(1);
    expect(foundIssue[0].assetId).toBeNull();

    expect(detailRes.body.deviceGroupMatchings.length).toBe(1);
    const matching = detailRes.body.deviceGroupMatchings[0];
    expect(foundIssue[0].deviceGroupMatchingId).toBe(matching.id);

    const [device] = payload.devices;
    expect(matching.manufacturer.canonicalName).toBe(device.manufacturer);
    expect(matching.product?.canonicalName).toBe(device.product);
    expect(matching.version?.canonicalName).toBe(device.version);

    const updateRes = await request(BASE_URL)
      .put(`/vulnerabilityRecords/${recordId}`)
      .set(authHeader)
      .send({
        data: {
          summary: "Mock -- updated summary",
          metrics: [{ type: "CVSS_V3_1", score: 4.2 }],
        },
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.summary).toBe("Mock -- updated summary");
    expect(updateRes.body.metrics).toEqual([
      expect.objectContaining({ score: 4.2, severity: "Medium" }),
    ]);

    // The vulnerability's last record: deleting it deletes the vulnerability.
    const deleteRes = await request(BASE_URL)
      .delete(`/vulnerabilityRecords/${recordId}`)
      .set(authHeader);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({
      id: recordId,
      vulnerabilityId,
      vulnerabilityDeleted: true,
    });

    const goneRes = await request(BASE_URL)
      .get(`/vulnerabilities/${vulnerabilityId}`)
      .set(authHeader);
    expect(goneRes.status).toBe(404);
  });

  it("POST /vulnerabilityRecords - A known identifier joins its vulnerability", async () => {
    const cve = `CVE-2099-${Date.now()}`;
    const first = await request(BASE_URL)
      .post("/vulnerabilityRecords")
      .set(authHeader)
      .send({ ...payload, identifiers: [cve] });
    expect(first.status).toBe(200);
    cleanUpVulnerability(first.body.vulnerabilityId);

    const second = await request(BASE_URL)
      .post("/vulnerabilityRecords")
      .set(authHeader)
      .send({
        devices: [generateDevice("vuln_v1_other")],
        identifiers: [cve.toLowerCase()],
        details: "Mock -- the same vulnerability, from another source",
      });

    expect(second.status).toBe(200);
    expect(second.body.source).toBe("OTHER");
    expect(second.body.ta3Submission).toBeNull();
    expect(second.body.vulnerabilityId).toBe(first.body.vulnerabilityId);

    const detailRes = await request(BASE_URL)
      .get(`/vulnerabilities/${first.body.vulnerabilityId}`)
      .set(authHeader);
    expect(detailRes.body.displayId).toBe(cve);
    expect(detailRes.body.deviceGroupMatchings.length).toBe(2);

    // Not the last record any more: the vulnerability stays.
    const deleteRes = await request(BASE_URL)
      .delete(`/vulnerabilityRecords/${second.body.id}`)
      .set(authHeader);
    expect(deleteRes.body.vulnerabilityDeleted).toBe(false);
  });

  it("POST /vulnerabilityRecords - Source and TA3 submission must agree", async () => {
    const otherWithSubmission = await request(BASE_URL)
      .post("/vulnerabilityRecords")
      .set(authHeader)
      .send({ ...payload, source: "OTHER" });
    expect(otherWithSubmission.status).toBe(400);

    const { ta3Submission: _ta3Submission, ...withoutSubmission } = payload;
    const ta3WithoutSubmission = await request(BASE_URL)
      .post("/vulnerabilityRecords")
      .set(authHeader)
      .send({ ...withoutSubmission, source: "TA3" });
    expect(ta3WithoutSubmission.status).toBe(400);

    const feedSource = await request(BASE_URL)
      .post("/vulnerabilityRecords")
      .set(authHeader)
      .send({ ...payload, source: "CISA_KEV" });
    expect(feedSource.status).toBe(400);
  });

  it("PUT/DELETE /vulnerabilityRecords/{id} - Only the owner may change a record", async () => {
    const res = await request(BASE_URL)
      .post("/vulnerabilityRecords")
      .set(authHeader)
      .send(payload);
    expect(res.status).toBe(200);
    cleanUpVulnerability(res.body.vulnerabilityId);

    const otherUser = await prisma.user.create({
      data: {
        id: `vuln-record-owner-${Date.now()}`,
        name: "Another user",
      },
    });
    onTestFinished(async () => {
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
    await prisma.vulnerabilityRecord.update({
      where: { id: res.body.id },
      data: { userId: otherUser.id },
    });

    const forbiddenUpdate = await request(BASE_URL)
      .put(`/vulnerabilityRecords/${res.body.id}`)
      .set(authHeader)
      .send({ data: { summary: "Not mine" } });
    expect(forbiddenUpdate.status).toBe(403);

    const forbiddenDelete = await request(BASE_URL)
      .delete(`/vulnerabilityRecords/${res.body.id}`)
      .set(authHeader);
    expect(forbiddenDelete.status).toBe(403);

    // A record with no owner can be changed by anyone.
    await prisma.vulnerabilityRecord.update({
      where: { id: res.body.id },
      data: { userId: null },
    });
    const allowedUpdate = await request(BASE_URL)
      .put(`/vulnerabilityRecords/${res.body.id}`)
      .set(authHeader)
      .send({ data: { summary: "Anyone's" } });
    expect(allowedUpdate.status).toBe(200);
  });

  it("empty Vulnerabilities uploadIntegration endpoint int test", async () => {
    const { integration } = await setupMockIntegration(mockIntegrationPayload);

    // this should succeed and nothing should be created
    const noVulnerabilities = { ...vulnerabilityIntegrationPayload, items: [] };
    const token = await createIntegrationToken(
      integration.integrationUserId,
      ResourceType.Vulnerability,
    );
    const createVulnResp = await request(BASE_URL)
      .post(`/vulnerabilities/integrationUpload/${token}`)
      .set(jsonHeader)
      .send(noVulnerabilities);

    expect(createVulnResp.status).toBe(200);
    expect(createVulnResp.body.createdItemsCount).toBe(0);
    expect(createVulnResp.body.updatedItemsCount).toBe(0);
    expect(createVulnResp.body.shouldRetry).toBe(false);
    expect(createVulnResp.body.message).toBe("success");
  });

  it("create Vulnerabilities uploadIntegration endpoint int test", async () => {
    const { integration: createdIntegration } = await setupMockIntegration(
      mockIntegrationPayload,
    );

    const upload = async () => {
      const token = await createIntegrationToken(
        createdIntegration.integrationUserId,
        ResourceType.Vulnerability,
      );
      return request(BASE_URL)
        .post(`/vulnerabilities/integrationUpload/${token}`)
        .set(jsonHeader)
        .send(vulnerabilityIntegrationPayload);
    };

    onTestFinished(async () => {
      await prisma.vulnerability.deleteMany({
        where: { description: { contains: descDeleteKeyWord } },
      });
      await prisma.deviceGroup.deleteMany({
        where: {
          cpe: {
            hasSome: [
              generateCPE("vuln_integration_v10"),
              generateCPE("vuln_integration_v11"),
            ],
          },
        },
      });
    });

    const integrationRes = await upload();

    expect(integrationRes.status).toBe(200);
    expect(integrationRes.body.createdItemsCount).toBe(2);
    expect(integrationRes.body.updatedItemsCount).toBe(0);
    expect(integrationRes.body.shouldRetry).toBe(false);
    expect(integrationRes.body.message).toBe("success");

    const findMapped = (externalId: string) =>
      prisma.externalVulnerabilityRecordMapping.findFirstOrThrow({
        where: { integrationId: createdIntegration.id, externalId },
        include: {
          item: {
            include: {
              ta3Submission: true,
              vulnerability: {
                include: {
                  deviceGroupMatchings: { include: { version: true } },
                },
              },
            },
          },
        },
      });

    const [item1, item2] = vulnerabilityIntegrationPayload.items;
    const mapping1 = await findMapped(item1.externalId);
    const mapping2 = await findMapped(item2.externalId);

    // Integration records have no owner, and follow the API's source rules.
    expect(mapping1.item.userId).toBeNull();
    expect(mapping1.item.source).toBe("TA3");
    expect(mapping1.item.details).toBe(item1.details);
    expect(mapping1.item.ta3Submission?.sarif).toStrictEqual(
      item1.ta3Submission?.sarif,
    );
    expect(mapping1.item.ta3Submission?.exploitUri).toBe(
      item1.ta3Submission?.exploitUri,
    );
    expect(mapping1.item.vulnerability.description).toBe(item1.details);
    expect(mapping1.item.vulnerability.deviceGroupMatchings.length).toBe(1);
    expect(
      mapping1.item.vulnerability.deviceGroupMatchings[0].version
        ?.canonicalName,
    ).toBe(item1.devices[0].version);

    expect(mapping2.item.source).toBe("OTHER");
    expect(mapping2.item.ta3Submission).toBeNull();

    if (!mapping1.lastSynced || !mapping2.lastSynced) {
      fail("lastSynced values should not be null");
    }
    expect(mapping1.lastSynced).toStrictEqual(mapping2.lastSynced);

    const foundSync = await prisma.integrationResourceSync.findFirstOrThrow({
      where: {
        integrationId: createdIntegration.id,
        resource: mockIntegrationPayload.config.resource,
      },
    });
    expect(foundSync.status).toBe(SyncStatusEnum.Success);
    expect(foundSync.errorMessage).toBeNullable();
    expect(foundSync.lastSuccessfulSync).toStrictEqual(mapping2.lastSynced);

    // Uploading the same items again updates their records.
    const resyncRes = await upload();
    expect(resyncRes.status).toBe(200);
    expect(resyncRes.body.createdItemsCount).toBe(0);
    expect(resyncRes.body.updatedItemsCount).toBe(2);
    expect(
      await prisma.vulnerabilityRecord.count({
        where: { id: { in: [mapping1.itemId, mapping2.itemId] } },
      }),
    ).toBe(2);
  });
});
