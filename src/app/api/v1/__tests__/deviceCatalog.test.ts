import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "@/lib/db";
import {
  authHeader,
  BASE_URL,
  deleteAssetsForDevices,
  namedDevice,
} from "./test-config";

const stamp = Date.now();
const device = namedDevice(
  `vitest_catalog_${stamp}`,
  `infuser_${stamp}`,
  "2.1",
);
const missingId = "missing-catalog-id";

type Ref = { id: string; url: string };
let asset: {
  id: string;
  vulnerabilitiesUrl: string;
  manufacturer: Ref;
  product: Ref;
  version: Ref;
};

const get = (path: string) => request(BASE_URL).get(path).set(authHeader);

beforeAll(async () => {
  const res = await request(BASE_URL)
    .post("/assets")
    .set(authHeader)
    .send({ ip: "10.0.9.1", device });
  expect(res.status).toBe(200);
  asset = res.body;
});

afterAll(async () => {
  await deleteAssetsForDevices([device]);
  if (!asset) return;
  await prisma.version.deleteMany({ where: { id: asset.version.id } });
  await prisma.product.deleteMany({ where: { id: asset.product.id } });
  await prisma.manufacturer.deleteMany({
    where: { id: asset.manufacturer.id },
  });
});

describe("Device catalog endpoints", () => {
  it("GET /manufacturers - Without auth, should be 401", async () => {
    const res = await request(BASE_URL).get("/manufacturers");
    expect(res.status).toBe(401);
  });

  it("links an asset to its manufacturer, product, version, and vulnerabilities", () => {
    expect(asset.manufacturer.url).toBe(
      `${BASE_URL}/manufacturers/${asset.manufacturer.id}`,
    );
    expect(asset.product.url).toBe(`${BASE_URL}/products/${asset.product.id}`);
    expect(asset.version.url).toBe(`${BASE_URL}/versions/${asset.version.id}`);
    expect(asset.vulnerabilitiesUrl).toBe(
      `${BASE_URL}/assets/${asset.id}/vulnerabilities`,
    );
  });

  it("GET /manufacturers - finds the manufacturer by name", async () => {
    const res = await get(`/manufacturers?search=catalog_${stamp}`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((m: Ref) => m.id)).toEqual([
      asset.manufacturer.id,
    ]);
  });

  it("GET /manufacturers/{id} and its products", async () => {
    const one = await get(`/manufacturers/${asset.manufacturer.id}`);
    expect(one.status).toBe(200);
    expect(one.body.productsUrl).toBe(
      `${BASE_URL}/manufacturers/${asset.manufacturer.id}/products`,
    );

    const products = await get(
      `/manufacturers/${asset.manufacturer.id}/products`,
    );
    expect(products.status).toBe(200);
    expect(products.body.items).toHaveLength(1);
    expect(products.body.items[0]).toMatchObject({
      id: asset.product.id,
      manufacturer: { id: asset.manufacturer.id },
      versionsUrl: `${BASE_URL}/products/${asset.product.id}/versions`,
    });
  });

  it("GET /products/{id} and its versions", async () => {
    const one = await get(`/products/${asset.product.id}`);
    expect(one.status).toBe(200);
    expect(one.body.manufacturer.url).toBe(asset.manufacturer.url);

    const versions = await get(`/products/${asset.product.id}/versions`);
    expect(versions.status).toBe(200);
    expect(versions.body.items.map((v: Ref) => v.id)).toEqual([
      asset.version.id,
    ]);
  });

  it("GET /versions/{id} links its product and sub-lists", async () => {
    const res = await get(`/versions/${asset.version.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      canonicalName: "2.1",
      product: { id: asset.product.id, url: asset.product.url },
      vulnerabilitiesUrl: `${asset.version.url}/vulnerabilities`,
      assetsUrl: `${asset.version.url}/assets`,
      deviceArtifactsUrl: `${asset.version.url}/deviceArtifacts`,
    });
    expect(res.body).not.toHaveProperty("manufacturer");
  });

  it("GET /versions/{id}/assets lists the asset", async () => {
    const res = await get(`/versions/${asset.version.id}/assets`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((a: Ref) => a.id)).toEqual([asset.id]);
  });

  it("serves the vulnerability and device artifact lists", async () => {
    for (const url of [
      asset.vulnerabilitiesUrl,
      `${asset.version.url}/vulnerabilities`,
      `${asset.version.url}/deviceArtifacts`,
    ]) {
      const res = await request(url).get("").set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    }
  });

  it.each([
    "/manufacturers/",
    "/products/",
    "/versions/",
    "/manufacturers/{id}/products",
    "/products/{id}/versions",
    "/versions/{id}/assets",
    "/versions/{id}/vulnerabilities",
    "/versions/{id}/deviceArtifacts",
    "/assets/{id}/vulnerabilities",
  ])("GET %s - an unknown id gives 404", async (template) => {
    const path = template.includes("{id}")
      ? template.replace("{id}", missingId)
      : `${template}${missingId}`;
    const res = await get(path);
    expect(res.status).toBe(404);
  });
});
