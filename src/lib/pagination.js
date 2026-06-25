"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePaginationParams = exports.paginationInputSchema = void 0;
exports.createPaginatedResponseSchema = createPaginatedResponseSchema;
exports.createPaginatedResponseWithLinksSchema = createPaginatedResponseWithLinksSchema;
exports.buildPaginationMeta = buildPaginationMeta;
exports.createPaginatedResponse = createPaginatedResponse;
var nuqs_1 = require("nuqs");
var zod_1 = require("zod");
var constants_1 = require("@/config/constants");
var url_state_1 = require("./url-state");
/**
 * Standard pagination input schema for tRPC procedures
 * Includes page, pageSize, and search parameters
 */
exports.paginationInputSchema = zod_1.z.object({
    page: zod_1.z
        .number()
        .int()
        .min(constants_1.PAGINATION.DEFAULT_PAGE)
        .default(constants_1.PAGINATION.DEFAULT_PAGE),
    pageSize: zod_1.z
        .number()
        .int()
        .min(constants_1.PAGINATION.MIN_PAGE_SIZE)
        .max(constants_1.PAGINATION.MAX_PAGE_SIZE)
        .default(constants_1.PAGINATION.DEFAULT_PAGE_SIZE),
    search: zod_1.z.string().default(""),
    sort: zod_1.z.string().default(""),
    lastUpdatedStartTime: zod_1.z.union([zod_1.z.literal(""), zod_1.z.iso.datetime()]).default(""),
    lastUpdatedEndTime: zod_1.z.union([zod_1.z.literal(""), zod_1.z.iso.datetime()]).default(""),
});
/**
 * Creates a paginated response schema with the given item schema
 */
function createPaginatedResponseSchema(itemSchema) {
    return zod_1.z.object({
        items: zod_1.z.array(itemSchema),
        page: zod_1.z.number(),
        pageSize: zod_1.z.number(),
        totalCount: zod_1.z.number(),
        totalPages: zod_1.z.number(),
        hasNextPage: zod_1.z.boolean(),
        hasPreviousPage: zod_1.z.boolean(),
    });
}
function createPaginatedResponseWithLinksSchema(itemSchema) {
    return zod_1.z.object({
        items: zod_1.z.array(itemSchema),
        page: zod_1.z.number(),
        pageSize: zod_1.z.number(),
        totalCount: zod_1.z.number(),
        totalPages: zod_1.z.number(),
        next: zod_1.z.union([zod_1.z.string(), zod_1.z.null()]),
        previous: zod_1.z.union([zod_1.z.string(), zod_1.z.null()]),
    });
}
/**
 * Builds pagination metadata from count and input parameters
 * Handles page capping to prevent expensive queries
 */
function buildPaginationMeta(input, totalCount) {
    var pageSize = input.pageSize;
    // Normalize totalPages to at least 1 for better UX
    var totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    // Cap page to prevent expensive queries with very large page numbers
    var page = Math.min(input.page, totalPages);
    var hasNextPage = page < totalPages;
    var hasPreviousPage = page > 1;
    return {
        page: page,
        pageSize: pageSize,
        totalCount: totalCount,
        totalPages: totalPages,
        hasNextPage: hasNextPage,
        hasPreviousPage: hasPreviousPage,
        skip: (page - 1) * pageSize,
        take: pageSize,
    };
}
/**
 * Helper to create a complete paginated response
 */
function createPaginatedResponse(items, meta) {
    return {
        items: items,
        page: meta.page,
        pageSize: meta.pageSize,
        totalCount: meta.totalCount,
        totalPages: meta.totalPages,
        hasNextPage: meta.hasNextPage,
        hasPreviousPage: meta.hasPreviousPage,
    };
}
var usePaginationParams = function () {
    var params = (0, url_state_1.createPaginationParams)();
    return (0, nuqs_1.useQueryStates)(params);
};
exports.usePaginationParams = usePaginationParams;
