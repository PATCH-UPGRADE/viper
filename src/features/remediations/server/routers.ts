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
const remediationInputSchema = z.object({
  fixUri: safeUrlSchema,
  vulnerabilityId: z.string(),
  cpe: z.string().regex(/^cpe:2\.3:[^:]+:[^:]+:[^:]+/, "Invalid CPE 2.3 format"),
  description: z.string().min(1),
  narrative: z.string().min(1),
  upstreamApi: safeUrlSchema,
});

const vulnerabilitySchema = z.object({
  id: z.string(),
  cpe: z.string(),
  description: z.string(),
  impact: z.string(),
});

const remediationResponseSchema = z.object({
  id: z.string(),
  fixUri: z.string(),
  vulnerabilityId: z.string(),
  cpe: z.string(),
  description: z.string(),
  narrative: z.string(),
  upstreamApi: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
  vulnerability: vulnerabilitySchema,
});

const paginatedRemediationResponseSchema = z.object({
  items: z.array(remediationResponseSchema),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const remediationsRouter = createTRPCRouter({
  // GET /api/remediations - List all remediations (any authenticated user can see all)
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
        path: "/remediations",
        tags: ["Remediations"],
        summary: "List Remediations",
        description: "Get all remediations. Any authenticated user can view all remediations.",
      },
    })
    .output(paginatedRemediationResponseSchema)
    .query(async ({ input }) => {
      const { pageSize, search } = input;

      // Build search filter across multiple fields
      const searchFilter = search
        ? {
            OR: [
              { cpe: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
              { narrative: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      // Get total count first to cap page number
      const totalCount = await prisma.remediation.count({
        where: searchFilter,
      });

      // Normalize totalPages to at least 1 for better UX
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

      // Cap page to prevent expensive queries with very large page numbers
      const page = Math.min(input.page, totalPages);

      const items = await prisma.remediation.findMany({
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
          vulnerability: {
            select: {
              id: true,
              cpe: true,
              description: true,
              impact: true,
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

  // GET /api/remediations/{id} - Get single remediation (any authenticated user can access)
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/remediations/{id}",
        tags: ["Remediations"],
        summary: "Get Remediation",
        description: "Get a single remediation by ID. Any authenticated user can view any remediation.",
      },
    })
    .output(remediationResponseSchema)
    .query(async ({ input }) => {
      return prisma.remediation.findUniqueOrThrow({
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
          vulnerability: {
            select: {
              id: true,
              cpe: true,
              description: true,
              impact: true,
            },
          },
        },
      });
    }),

  // POST /api/remediations - Create remediation
  create: protectedProcedure
    .input(remediationInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/remediations",
        tags: ["Remediations"],
        summary: "Create Remediation",
        description: "Create a new remediation. The authenticated user will be recorded as the creator.",
      },
    })
    .output(remediationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify the vulnerability exists
      const vulnerability = await prisma.vulnerability.findUnique({
        where: { id: input.vulnerabilityId },
      });

      if (!vulnerability) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vulnerability not found",
        });
      }

      return prisma.remediation.create({
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
          vulnerability: {
            select: {
              id: true,
              cpe: true,
              description: true,
              impact: true,
            },
          },
        },
      });
    }),

  // DELETE /api/remediations/{id} - Delete remediation (only creator can delete)
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/remediations/{id}",
        tags: ["Remediations"],
        summary: "Delete Remediation",
        description: "Delete a remediation. Only the user who created the remediation can delete it.",
      },
    })
    .output(remediationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // First check if the remediation exists and belongs to the current user
      const remediation = await prisma.remediation.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!remediation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Remediation not found",
        });
      }

      if (remediation.userId !== ctx.auth.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete remediations that you created",
        });
      }

      return prisma.remediation.delete({
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
          vulnerability: {
            select: {
              id: true,
              cpe: true,
              description: true,
              impact: true,
            },
          },
        },
      });
    }),

  // PUT /api/remediations/{id} - Update remediation (only creator can update)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: remediationInputSchema,
      })
    )
    .meta({
      openapi: {
        method: "PUT",
        path: "/remediations/{id}",
        tags: ["Remediations"],
        summary: "Update Remediation",
        description: "Update a remediation. Only the user who created the remediation can update it.",
      },
    })
    .output(remediationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // First check if the remediation exists and belongs to the current user
      const remediation = await prisma.remediation.findUnique({
        where: { id: input.id },
        select: { userId: true, vulnerabilityId: true },
      });

      if (!remediation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Remediation not found",
        });
      }

      if (remediation.userId !== ctx.auth.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only update remediations that you created",
        });
      }

      // Verify the vulnerability exists if it's being changed
      if (input.data.vulnerabilityId !== remediation.vulnerabilityId) {
        const vulnerability = await prisma.vulnerability.findUnique({
          where: { id: input.data.vulnerabilityId },
        });

        if (!vulnerability) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vulnerability not found",
          });
        }
      }

      return prisma.remediation.update({
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
          vulnerability: {
            select: {
              id: true,
              cpe: true,
              description: true,
              impact: true,
            },
          },
        },
      });
    }),
});
