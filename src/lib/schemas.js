"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alohaResponseSchema = exports.alohaInputSchema = exports.createIntegrationInputSchema = exports.integrationResponseSchema = exports.userIncludeSelect = exports.authSchema = exports.authenticationSchema = exports.headerAuthSchema = exports.bearerAuthSchema = exports.basicAuthSchema = exports.deviceGroupMatchingResponseSchema = exports.versSchemeSchema = exports.versionStatusSchema = exports.cpeSchema = exports.safeUrlSchema = exports.userSchema = void 0;
var zod_1 = require("zod");
var prisma_1 = require("@/generated/prisma");
var pagination_1 = require("./pagination");
/**
 * Shared Zod schema for User responses
 * Matches Prisma User model (name is required, email and image are nullable)
 */
exports.userSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    email: zod_1.z.string().nullable(),
    image: zod_1.z.string().nullable(),
});
/**
 * Reusable URL validator to prevent javascript: and other dangerous protocols
 * Only allows http, https, and git protocols
 */
exports.safeUrlSchema = zod_1.z
    .string()
    .url()
    .refine(function (url) {
    try {
        var protocol = new URL(url).protocol;
        return (protocol === "http:" || protocol === "https:" || protocol === "git:");
    }
    catch (_a) {
        return false;
    }
}, { message: "Only http(s) and git URLs allowed" });
/**
 * CPE 2.3 format validator
 * Validates Common Platform Enumeration strings
 */
exports.cpeSchema = zod_1.z
    .string()
    .regex(/^cpe:2\.3:[^:]+:[^:]+:[^:]+/, "Invalid CPE 2.3 format");
exports.versionStatusSchema = zod_1.z.enum(Object.values(prisma_1.VersionStatus));
exports.versSchemeSchema = zod_1.z.enum(Object.values(prisma_1.VersScheme));
/** A canonical vendor/product/version reference as returned by the API. */
var canonicalRefSchema = zod_1.z.object({
    canonicalName: zod_1.z.string(),
    canonicalDisplayName: zod_1.z.string(),
});
/** A stored device-group matching as returned by the API. */
exports.deviceGroupMatchingResponseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    vendor: canonicalRefSchema,
    product: canonicalRefSchema.nullable(),
    version: canonicalRefSchema.nullable(),
    versionRange: zod_1.z.string().nullable(),
});
exports.basicAuthSchema = zod_1.z.object({
    username: zod_1.z.string(),
    password: zod_1.z.string(),
});
exports.bearerAuthSchema = zod_1.z.object({
    token: zod_1.z.string(),
});
exports.headerAuthSchema = zod_1.z.object({
    header: zod_1.z.string(),
    value: zod_1.z.string(),
});
exports.authenticationSchema = zod_1.z.union([
    exports.basicAuthSchema,
    exports.bearerAuthSchema,
    exports.headerAuthSchema,
]);
exports.authSchema = zod_1.z
    .object({
    authType: zod_1.z.enum(Object.values(prisma_1.AuthType)),
    authentication: exports.authenticationSchema.optional(),
})
    .superRefine(function (value, ctx) {
    if (value.authType !== "None" && !value.authentication) {
        ctx.addIssue({
            code: "custom",
            message: "Authentication details are required for the selected auth type.",
            path: ["authentication"],
        });
    }
});
/**
 * Shared user include/select pattern for Prisma queries
 * Use this consistently across all routers when including user relations
 */
exports.userIncludeSelect = {
    select: {
        id: true,
        name: true,
        email: true,
        image: true,
    },
};
exports.integrationResponseSchema = zod_1.z.object({
    message: zod_1.z.string(),
    createdItemsCount: zod_1.z.number(),
    updatedItemsCount: zod_1.z.number(),
    shouldRetry: zod_1.z.boolean(),
    syncedAt: zod_1.z.string(),
});
var createIntegrationInputSchema = function (inputSchema) {
    var integrationInputSchema = inputSchema.extend({
        vendorId: zod_1.z.string(),
    });
    var pagesWithLinksSchema = (0, pagination_1.createPaginatedResponseWithLinksSchema)(integrationInputSchema);
    return pagesWithLinksSchema.extend({
        token: zod_1.z.string(), // the user token calling this endpoint
    });
};
exports.createIntegrationInputSchema = createIntegrationInputSchema;
exports.alohaInputSchema = zod_1.z.object({
    status: zod_1.z.enum(Object.keys(prisma_1.AlohaStatus)),
    log: zod_1.z.any().optional(),
});
exports.alohaResponseSchema = zod_1.z.object({
    status: zod_1.z.enum(Object.values(prisma_1.AlohaStatus)).nullable(),
    log: zod_1.z.any(),
});
