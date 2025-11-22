import z from "zod";
import { PAGINATION } from "@/config/constants";

/**
 * Standard pagination input schema for tRPC procedures
 * Includes page, pageSize, and search parameters
 */
export const paginationInputSchema = z.object({
  page: z
    .number()
    .int()
    .min(PAGINATION.DEFAULT_PAGE)
    .default(PAGINATION.DEFAULT_PAGE),
  pageSize: z
    .number()
    .int()
    .min(PAGINATION.MIN_PAGE_SIZE)
    .max(PAGINATION.MAX_PAGE_SIZE)
    .default(PAGINATION.DEFAULT_PAGE_SIZE),
  search: z.string().default(""),
});

export type PaginationInput = z.infer<typeof paginationInputSchema>;

/**
 * Creates a paginated response schema with the given item schema
 */
export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number(),
    pageSize: z.number(),
    totalCount: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  });
}

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

/**
 * Builds pagination metadata from count and input parameters
 * Handles page capping to prevent expensive queries
 */
export function buildPaginationMeta(input: PaginationInput, totalCount: number) {
  const { pageSize } = input;

  // Normalize totalPages to at least 1 for better UX
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Cap page to prevent expensive queries with very large page numbers
  const page = Math.min(input.page, totalPages);

  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  return {
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * Helper to create a complete paginated response
 */
export function createPaginatedResponse<T>(
  items: T[],
  meta: ReturnType<typeof buildPaginationMeta>,
): PaginatedResponse<T> {
  return {
    items,
    page: meta.page,
    pageSize: meta.pageSize,
    totalCount: meta.totalCount,
    totalPages: meta.totalPages,
    hasNextPage: meta.hasNextPage,
    hasPreviousPage: meta.hasPreviousPage,
  };
}
