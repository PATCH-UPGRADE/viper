import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { PAGINATION } from "@/config/constants";
import { userSchema } from "@/lib/schemas";

// Reusable URL validator to prevent javascript: and other dangerous protocols
const safeUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => {
      try {
        const protocol = new URL(url).protocol;
        return protocol === "http:" || protocol === "https:" || protocol === "git:";
      } catch {
        return false;
      }
    },
    { message: "Only http(s) and git URLs allowed" },
  );

// Validation schemas
const vulnerabilityInputSchema = z.object({
  sarif: z.any(), // JSON data - Prisma JsonValue type
  cpe: z.string().regex(/^cpe:2\.3:[^:]+:[^:]+:[^:]+/, "Invalid CPE 2.3 format"),
  exploitUri: safeUrlSchema,
  upstreamApi: safeUrlSchema,
  description: z.string().min(1),
  narrative: z.string().min(1),
  impact: z.string().min(1),
});

const vulnerabilityResponseSchema = z.object({
  id: z.string(),
  sarif: z.any(), // JSON data - Prisma JsonValue type
  cpe: z.string(),
  exploitUri: z.string(),
  upstreamApi: z.string(),
  description: z.string(),
  narrative: z.string(),
  impact: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});

const paginatedVulnerabilityResponseSchema = z.object({
  items: z.array(vulnerabilityResponseSchema),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const vulnerabilitiesRouter = createTRPCRouter({
  // GET /api/vulnerabilities - List all vulnerabilities (any authenticated user can see all)
  getMany: protectedProcedure
    .input(
      z.object({
        page: z
          .number()
          .min(PAGINATION.DEFAULT_PAGE)
          .default(PAGINATION.DEFAULT_PAGE),
        pageSize: z
          .number()
          .min(PAGINATION.MIN_PAGE_SIZE)
          .max(PAGINATION.MAX_PAGE_SIZE)
          .default(PAGINATION.DEFAULT_PAGE_SIZE),
        search: z.string().default(""),
      })
    )
    .meta({
      openapi: {
        method: "GET",
        path: "/vulnerabilities",
        tags: ["Vulnerabilities"],
        summary: "List Vulnerabilities",
        description: "Get all vulnerabilities. Any authenticated user can view all vulnerabilities.",
      },
    })
    .output(paginatedVulnerabilityResponseSchema)
    .query(async ({ input }) => {
      const { pageSize, search } = input;

      // Build search filter across multiple fields
      const searchFilter = search
        ? {
            OR: [
              { cpe: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
              { impact: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      // Get total count first to cap page number
      const totalCount = await prisma.vulnerability.count({
        where: searchFilter,
      });

      // Normalize totalPages to at least 1 for better UX
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

      // Cap page to prevent expensive queries with very large page numbers
      const page = Math.min(input.page, totalPages);

      const items = await prisma.vulnerability.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        where: searchFilter,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        items,
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      };
    }),

  // GET /api/vulnerabilities/{id} - Get single vulnerability (any authenticated user can access)
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/vulnerabilities/{id}",
        tags: ["Vulnerabilities"],
        summary: "Get Vulnerability",
        description: "Get a single vulnerability by ID. Any authenticated user can view any vulnerability.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .query(async ({ input }) => {
      return prisma.vulnerability.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });
    }),

  // POST /api/vulnerabilities - Create vulnerability
  create: protectedProcedure
    .input(vulnerabilityInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/vulnerabilities",
        tags: ["Vulnerabilities"],
        summary: "Create Vulnerability",
        description: "Create a new vulnerability. The authenticated user will be recorded as the creator.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .mutation(({ ctx, input }) => {
      return prisma.vulnerability.create({
        data: {
          ...input,
          userId: ctx.auth.user.id,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });
    }),

  // DELETE /api/vulnerabilities/{id} - Delete vulnerability (only creator can delete)
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/vulnerabilities/{id}",
        tags: ["Vulnerabilities"],
        summary: "Delete Vulnerability",
        description: "Delete a vulnerability. Only the user who created the vulnerability can delete it.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // First check if the vulnerability exists and belongs to the current user
      const vulnerability = await prisma.vulnerability.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!vulnerability) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vulnerability not found",
        });
      }

      if (vulnerability.userId !== ctx.auth.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete vulnerabilities that you created",
        });
      }

      return prisma.vulnerability.delete({
        where: { id: input.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });
    }),

  // PUT /api/vulnerabilities/{id} - Update vulnerability (only creator can update)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: vulnerabilityInputSchema,
      })
    )
    .meta({
      openapi: {
        method: "PUT",
        path: "/vulnerabilities/{id}",
        tags: ["Vulnerabilities"],
        summary: "Update Vulnerability",
        description: "Update a vulnerability. Only the user who created the vulnerability can update it.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // First check if the vulnerability exists and belongs to the current user
      const vulnerability = await prisma.vulnerability.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!vulnerability) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vulnerability not found",
        });
      }

      if (vulnerability.userId !== ctx.auth.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only update vulnerabilities that you created",
        });
      }

      return prisma.vulnerability.update({
        where: { id: input.id },
        data: input.data,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });
    }),
});
