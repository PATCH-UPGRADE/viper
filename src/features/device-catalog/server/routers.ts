import { z } from "zod";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import { fetchPaginated, nameOrClauses } from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import {
  manufacturerResponseSchema,
  manufacturerSelect,
  paginatedManufacturerResponseSchema,
  paginatedProductResponseSchema,
  paginatedVersionResponseSchema,
  productResponseSchema,
  productSelect,
  versionResponseSchema,
  versionSelect,
} from "../types";

const nameSearch = (search: string) =>
  search ? { OR: nameOrClauses(search) } : {};

const byParentInput = paginationInputSchema.extend({ id: z.string() });

export const manufacturersRouter = createTRPCRouter({
  // GET /api/manufacturers - List manufacturers
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/manufacturers",
        tags: ["Manufacturers"],
        summary: "List Manufacturers",
        description:
          "Get all manufacturers. search matches the canonical name, the display name, or an alias.",
      },
    })
    .output(paginatedManufacturerResponseSchema)
    .query(({ input }) =>
      fetchPaginated(prisma.manufacturer, input, {
        where: nameSearch(input.search),
        select: manufacturerSelect,
        orderBy: { canonicalName: "asc" },
      }),
    ),

  // GET /api/manufacturers/{id} - Get one manufacturer
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/manufacturers/{id}",
        tags: ["Manufacturers"],
        summary: "Get Manufacturer",
        description: "Get one manufacturer by id.",
      },
    })
    .output(manufacturerResponseSchema)
    .query(async ({ input }) => {
      const manufacturer = await prisma.manufacturer.findUnique({
        where: { id: input.id },
        select: manufacturerSelect,
      });
      return requireExistence(manufacturer, "Manufacturer");
    }),
});

export const productsRouter = createTRPCRouter({
  // GET /api/manufacturers/{id}/products - List a manufacturer's products
  getManyByManufacturer: protectedProcedure
    .input(byParentInput)
    .meta({
      openapi: {
        method: "GET",
        path: "/manufacturers/{id}/products",
        tags: ["Products", "Manufacturers"],
        summary: "List Products by Manufacturer",
        description:
          "Get the products of one manufacturer. search matches the canonical name, the display name, or an alias.",
      },
    })
    .output(paginatedProductResponseSchema)
    .query(async ({ input }) => {
      const manufacturer = await prisma.manufacturer.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      requireExistence(manufacturer, "Manufacturer");
      return fetchPaginated(prisma.product, input, {
        where: { manufacturerId: input.id, ...nameSearch(input.search) },
        select: productSelect,
        orderBy: { canonicalName: "asc" },
      });
    }),

  // GET /api/products/{id} - Get one product
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/products/{id}",
        tags: ["Products"],
        summary: "Get Product",
        description:
          "Get one product by id, with its device type and manufacturer.",
      },
    })
    .output(productResponseSchema)
    .query(async ({ input }) => {
      const product = await prisma.product.findUnique({
        where: { id: input.id },
        select: productSelect,
      });
      return requireExistence(product, "Product");
    }),
});

export const versionsRouter = createTRPCRouter({
  // GET /api/products/{id}/versions - List a product's versions
  getManyByProduct: protectedProcedure
    .input(byParentInput)
    .meta({
      openapi: {
        method: "GET",
        path: "/products/{id}/versions",
        tags: ["Versions", "Products"],
        summary: "List Versions by Product",
        description:
          "Get the versions of one product. search matches the canonical name or the display name.",
      },
    })
    .output(paginatedVersionResponseSchema)
    .query(async ({ input }) => {
      const product = await prisma.product.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      requireExistence(product, "Product");
      const insensitive = {
        contains: input.search,
        mode: "insensitive" as const,
      };
      return fetchPaginated(prisma.version, input, {
        where: {
          productId: input.id,
          ...(input.search
            ? {
                OR: [
                  { canonicalName: insensitive },
                  { canonicalDisplayName: insensitive },
                ],
              }
            : {}),
        },
        select: versionSelect,
        orderBy: { canonicalName: "asc" },
      });
    }),

  // GET /api/versions/{id} - Get one version
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/versions/{id}",
        tags: ["Versions"],
        summary: "Get Version",
        description:
          "Get one version by id, with its product and links to its vulnerabilities, assets, and device artifacts.",
      },
    })
    .output(versionResponseSchema)
    .query(async ({ input }) => {
      const version = await prisma.version.findUnique({
        where: { id: input.id },
        select: versionSelect,
      });
      return requireExistence(version, "Version");
    }),
});
