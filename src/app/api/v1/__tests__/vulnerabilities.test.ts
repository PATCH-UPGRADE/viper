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
  deleteAssetsForDevices,
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
    sourceId: "MOCK-TA3-0001",
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
    device: generateDevice("vuln_v1"),
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
        // The source's own ID for the advisory, separate from the integration's item key.
        sourceId: "GHSA-mock-0002",
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
    expect(res.body.sourceId).toBe(payload.sourceId);
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
    expect(detailRes.body.records).toEqual([
      expect.objectContaining({
        id: recordId,
        source: "TA3",
        sourceId: payload.sourceId,
        user: expect.objectContaining({ id: res.body.userId }),
        metrics: [expect.objectContaining({ type: "CVSS_V3_1", score: 8.1 })],
        ta3Submission: expect.objectContaining({ recordId, vulnerabilityId }),
      }),
    ]);

    // One issue per affected device group, not one per asset.
    const foundIssue = await prisma.issue.findMany({
      where: { vulnerabilityId },
    });
    expect(foundIssue.length).toBe(1);
    expect(foundIssue[0].assetId).toBeNull();

    expect(detailRes.body.deviceGroupMatchings.length).toBe(1);

    // The single issue should be scoped to that one device group matching,
    // not to the individual asset (one issue per affected device group, not
    // one per asset).
    expect(foundIssue[0].deviceGroupMatchingId).toBe(
      detailRes.body.deviceGroupMatchings[0].id,
    );

    // Check that the single object in the array has the correct match values
    // (resolved from the uploaded device input)
    const [device] = payload.devices;
    const matching = detailRes.body.deviceGroupMatchings[0];
    expect(matching.manufacturer.canonicalName).toBe(device.manufacturer.name);
    expect(matching.product?.canonicalName).toBe(device.product?.name);
    expect(matching.version?.canonicalName).toBe(device.version?.name);

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
    expect(detailRes.body.identifiers).toContainEqual(
      expect.objectContaining({ value: cve }),
    );
    expect(detailRes.body.records.map((r: { id: string }) => r.id)).toEqual([
      first.body.id,
      second.body.id,
    ]);

    // Search matches identifiers, case-insensitively.
    const searchRes = await request(BASE_URL)
      .get("/vulnerabilities")
      .query({ search: cve.toLowerCase() })
      .set(authHeader);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.items.map((v: { id: string }) => v.id)).toContain(
      first.body.vulnerabilityId,
    );

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
      await deleteAssetsForDevices([
        generateDevice("vuln_integration_v10"),
        generateDevice("vuln_integration_v11"),
      ]);
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
    ).toBe(item1.devices[0].version.name);

    expect(mapping2.item.source).toBe("OTHER");
    expect(mapping2.item.ta3Submission).toBeNull();
    // The item's sourceId lands on the record; its externalId keys the mapping.
    expect(mapping2.item.sourceId).toBe(item2.sourceId);
    expect(mapping2.externalId).toBe(item2.externalId);
    expect(mapping1.item.sourceId).toBeNull();

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

describe("Vulnerability Records Endpoint version input", () => {
  const stamp = Date.now();
  const device = (version: unknown) => ({
    manufacturer: { name: "vitest" },
    product: { name: `range_${stamp}` },
    version,
  });
  const create = (devices: unknown[]) =>
    request(BASE_URL).post("/vulnerabilityRecords").set(authHeader).send({
      details: "Mock -- version input",
      devices,
    });
  /** Create a record, and read back the vulnerability it joined. */
  const createVulnerability = async (devices: unknown[]) => {
    const res = await create(devices);
    expect(res.status).toBe(200);
    cleanUpVulnerability(res.body.vulnerabilityId);
    const vuln = await request(BASE_URL)
      .get(`/vulnerabilities/${res.body.vulnerabilityId}`)
      .set(authHeader);
    expect(vuln.status).toBe(200);
    return vuln.body;
  };

  it("POST /vulnerabilityRecords - stores a VERS range on the matching", async () => {
    const vuln = await createVulnerability([
      device({ range: "vers:semver/>=8.0|<8.2" }),
    ]);

    expect(vuln.deviceGroupMatchings).toHaveLength(1);
    expect(vuln.deviceGroupMatchings[0]).toMatchObject({
      version: null,
      versionRange: "vers:semver/>=8.0|<8.2",
    });
  });

  it("POST /vulnerabilityRecords - vers:all/* is a product-level matching", async () => {
    const vuln = await createVulnerability([device({ range: "vers:all/*" })]);

    expect(vuln.deviceGroupMatchings[0]).toMatchObject({
      version: null,
      versionRange: null,
    });
  });

  it("POST /vulnerabilityRecords - an UNKNOWN version matches the product's assets", async () => {
    const asset = await request(BASE_URL)
      .post("/assets")
      .set(authHeader)
      .send({ ip: "10.0.8.1", device: device({ name: "8.1" }) });
    expect(asset.status).toBe(200);
    onTestFinished(async () => {
      await request(BASE_URL)
        .delete(`/assets/${asset.body.id}`)
        .set(authHeader);
    });

    const vuln = await createVulnerability([device({ status: "UNKNOWN" })]);

    expect(vuln.deviceGroupMatchings[0]).toMatchObject({
      version: null,
      versionRange: null,
      versionStatus: "UNKNOWN",
    });
    const affecting = await request(BASE_URL)
      .get(`/assets/${asset.body.id}/vulnerabilities`)
      .set(authHeader);
    expect(affecting.body.items.map((v: { id: string }) => v.id)).toContain(
      vuln.id,
    );
    // Possibly at risk, not known to be: the baseline issue opens under
    // investigation.
    const issue = await prisma.issue.findFirst({
      where: { vulnerabilityId: vuln.id },
      select: { status: true },
    });
    expect(issue?.status).toBe("UNDER_INVESTIGATION");
  });

  it.each([
    ["no version", undefined],
    ["a range that is not VERS", { range: ">=8.0" }],
    ["a range that does not parse", { range: "vers:semver" }],
    ["an asset-only version status", { status: "UNSURE" }],
  ])("POST /vulnerabilityRecords - %s is a 400", async (_label, version) => {
    const res = await create([device(version)]);

    expect(res.status).toBe(400);
  });
});
