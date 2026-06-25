"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var prisma_1 = require("@/generated/prisma");
var prisma_client_extensions_1 = require("./prisma-client-extensions");
var createPrismaClient = function () {
    return new prisma_1.PrismaClient()
        .$extends(prisma_client_extensions_1.deviceGroupExtension)
        .$extends(prisma_client_extensions_1.artifactExtension)
        .$extends(prisma_client_extensions_1.vulnerabilityExtension)
        .$extends(prisma_client_extensions_1.sendWebhooksExtension)
        .$extends(prisma_client_extensions_1.updateConnectorExtension);
};
// see https://www.prisma.io/docs/guides/nextjs#26-set-up-prisma-client
var globalForPrisma = globalThis;
var prisma = (_a = globalForPrisma.prisma) !== null && _a !== void 0 ? _a : createPrismaClient();
if (process.env.NODE_ENV !== "production")
    globalForPrisma.prisma = prisma;
exports.default = prisma;
var canonicalRefSelect = {
    select: { canonicalName: true, canonicalDisplayName: true },
};
var deviceGroupSummarySelect = {
    select: {
        id: true,
        vendor: canonicalRefSelect,
        product: canonicalRefSelect,
        version: canonicalRefSelect,
        versionStatus: true,
        cpe: true,
    },
};
