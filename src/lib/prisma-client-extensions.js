"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateConnectorExtension = exports.sendWebhooksExtension = exports.vulnerabilityExtension = exports.artifactExtension = exports.deviceGroupExtension = void 0;
var prisma_1 = require("@/generated/prisma");
var client_1 = require("@/inngest/client");
var db_1 = require("./db");
var device_matching_1 = require("./device-matching");
var url_utils_1 = require("./url-utils");
var utils_1 = require("./utils");
// add more helper urls for device group
exports.deviceGroupExtension = prisma_1.Prisma.defineExtension({
    name: "deviceGroupUrls",
    result: {
        deviceGroup: {
            url: {
                needs: { id: true },
                compute: function (deviceGroup) {
                    return "".concat((0, url_utils_1.getBaseUrl)(), "/api/v1/deviceGroups/").concat(deviceGroup.id);
                },
            },
            sbomUrl: {
                needs: { id: true, helmSbomId: true },
                compute: function (deviceGroup) {
                    if (!deviceGroup.helmSbomId) {
                        return null;
                    }
                    return "".concat((0, url_utils_1.getBaseUrl)(), "/api/v1/deviceGroups/").concat(deviceGroup.helmSbomId, "/sbom");
                },
            },
            vulnerabilitiesUrl: {
                needs: { id: true },
                compute: function (deviceGroup) {
                    return "".concat((0, url_utils_1.getBaseUrl)(), "/api/v1/deviceGroups/").concat(deviceGroup.id, "/vulnerabilities");
                },
            },
            deviceArtifactsUrl: {
                needs: { id: true },
                compute: function (deviceGroup) {
                    return "".concat((0, url_utils_1.getBaseUrl)(), "/api/v1/deviceGroups/").concat(deviceGroup.id, "/emulators");
                },
            },
            assetsUrl: {
                needs: { id: true },
                compute: function (deviceGroup) {
                    return "".concat((0, url_utils_1.getBaseUrl)(), "/api/v1/deviceGroups/").concat(deviceGroup.id, "/assets");
                },
            },
        },
    },
});
// add more helper urls for artifacts
exports.artifactExtension = prisma_1.Prisma.defineExtension({
    name: "artifactUrls",
    result: {
        artifactWrapper: {
            allVersionsUrl: {
                needs: { id: true },
                compute: function (artifactWrapper) {
                    return "".concat((0, url_utils_1.getBaseUrl)(), "/api/v1/artifacts/versions/").concat(artifactWrapper.id);
                },
            },
        },
        artifact: {
            url: {
                needs: { id: true },
                compute: function (artifact) {
                    return "".concat((0, url_utils_1.getBaseUrl)(), "/api/v1/artifacts/").concat(artifact.id);
                },
            },
        },
    },
});
// create issues on vulnerability create
exports.vulnerabilityExtension = prisma_1.Prisma.defineExtension(function (client) {
    return client.$extends({
        name: "vulnerabilityIssueCreation",
        query: {
            vulnerability: {
                create: function (_a) {
                    return __awaiter(this, arguments, void 0, function (_b) {
                        var vulnerability, vulnerabilityId, matchings, candidateGroups, matchedGroupIds, assets;
                        var query = _b.query, args = _b.args;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0: return [4 /*yield*/, query(args)];
                                case 1:
                                    vulnerability = _c.sent();
                                    vulnerabilityId = vulnerability.id;
                                    return [4 /*yield*/, client.deviceGroupMatching.findMany({
                                            where: { vulnerabilities: { some: { id: vulnerabilityId } } },
                                            select: {
                                                vendorId: true,
                                                productId: true,
                                                versionId: true,
                                                versionRange: true,
                                            },
                                        })];
                                case 2:
                                    matchings = _c.sent();
                                    if (!(matchings.length > 0)) return [3 /*break*/, 6];
                                    return [4 /*yield*/, client.deviceGroup.findMany({
                                            where: { OR: matchings.map(device_matching_1.deviceGroupWhereForMatching) },
                                            select: {
                                                id: true,
                                                vendorId: true,
                                                productId: true,
                                                versionId: true,
                                                version: { select: { canonicalName: true } },
                                            },
                                        })];
                                case 3:
                                    candidateGroups = _c.sent();
                                    matchedGroupIds = (0, device_matching_1.resolveMatches)(matchings, candidateGroups).map(function (group) { return group.id; });
                                    if (!(matchedGroupIds.length > 0)) return [3 /*break*/, 6];
                                    return [4 /*yield*/, client.asset.findMany({
                                            where: { deviceGroupId: { in: matchedGroupIds } },
                                            select: { id: true },
                                        })];
                                case 4:
                                    assets = _c.sent();
                                    if (!(assets.length > 0)) return [3 /*break*/, 6];
                                    return [4 /*yield*/, client.issue.createMany({
                                            data: assets.map(function (asset) { return ({
                                                vulnerabilityId: vulnerabilityId,
                                                assetId: asset.id,
                                            }); }),
                                        })];
                                case 5:
                                    _c.sent();
                                    _c.label = 6;
                                case 6:
                                    client_1.inngest
                                        .send({
                                        name: "vulnerability/enrich.requested",
                                        data: { vulnerabilityId: vulnerabilityId },
                                    })
                                        .catch(function (err) {
                                        console.error("Failed to dispatch vulnerability enrichment event:", err);
                                    });
                                    return [2 /*return*/, vulnerability];
                            }
                        });
                    });
                },
            },
        },
        result: {
            vulnerability: {
                url: {
                    needs: { id: true },
                    compute: function (vulnerability) {
                        return "".concat((0, url_utils_1.getBaseUrl)(), "/api/v1/vulnerabilities/").concat(vulnerability.id);
                    },
                },
            },
        },
    });
});
var sendWebhooks = function (triggerType, timestamp) { return __awaiter(void 0, void 0, void 0, function () {
    var webhooks, e_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, db_1.default.webhook.findMany({
                        where: { triggers: { has: triggerType } },
                    })];
            case 1:
                webhooks = _a.sent();
                return [4 /*yield*/, Promise.allSettled(webhooks.map(function (webhook) { return (0, utils_1.sendWebhook)(triggerType, timestamp, webhook); }))];
            case 2:
                _a.sent();
                return [3 /*break*/, 4];
            case 3:
                e_1 = _a.sent();
                console.error("Failed to send webhook with error:", e_1);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
var handleSimpleQuery = function (triggerType, time) {
    sendWebhooks(triggerType, !time ? new Date() : time);
};
var handleUpsertQuery = function (createdTrigger, updatedTrigger, createdAt, updatedAt) {
    // Need to check if upsert was a create or update by checking timestamps
    var timestamp = new Date();
    var trigger = updatedTrigger;
    if (createdAt && updatedAt) {
        var created = createdAt;
        var updated = updatedAt;
        timestamp = updated;
        if (created.getTime() === updated.getTime()) {
            trigger = createdTrigger;
        }
    }
    sendWebhooks(trigger, timestamp);
};
var createWebhookHandlers = function (createdTrigger, updatedTrigger) { return ({
    // biome-ignore lint/suspicious/noExplicitAny: Prisma query/args types vary per model but the webhook logic is identical
    update: function (_a) {
        return __awaiter(this, arguments, void 0, function (_b) {
            var item;
            var args = _b.args, query = _b.query;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, query(args)];
                    case 1:
                        item = _c.sent();
                        handleSimpleQuery(updatedTrigger, item.updatedAt);
                        return [2 /*return*/, item];
                }
            });
        });
    },
    // biome-ignore lint/suspicious/noExplicitAny: Prisma query/args types vary per model but the webhook logic is identical
    upsert: function (_a) {
        return __awaiter(this, arguments, void 0, function (_b) {
            var item;
            var args = _b.args, query = _b.query;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, query(args)];
                    case 1:
                        item = _c.sent();
                        handleUpsertQuery(createdTrigger, updatedTrigger, item.createdAt, item.updatedAt);
                        return [2 /*return*/, item];
                }
            });
        });
    },
    // biome-ignore lint/suspicious/noExplicitAny: Prisma query/args types vary per model but the webhook logic is identical
    create: function (_a) {
        return __awaiter(this, arguments, void 0, function (_b) {
            var item;
            var args = _b.args, query = _b.query;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, query(args)];
                    case 1:
                        item = _c.sent();
                        handleSimpleQuery(createdTrigger, item.createdAt);
                        return [2 /*return*/, item];
                }
            });
        });
    },
}); };
exports.sendWebhooksExtension = prisma_1.Prisma.defineExtension({
    name: "sendWebhooksOnDatabaseEvent",
    query: {
        artifact: createWebhookHandlers(prisma_1.TriggerEnum.Artifact_Created, prisma_1.TriggerEnum.Artifact_Updated),
        deviceArtifact: createWebhookHandlers(prisma_1.TriggerEnum.DeviceArtifact_Created, prisma_1.TriggerEnum.DeviceArtifact_Updated),
        deviceGroup: createWebhookHandlers(prisma_1.TriggerEnum.DeviceGroup_Created, prisma_1.TriggerEnum.DeviceGroup_Updated),
        remediation: createWebhookHandlers(prisma_1.TriggerEnum.Remediation_Created, prisma_1.TriggerEnum.Remediation_Updated),
        vulnerability: createWebhookHandlers(prisma_1.TriggerEnum.Vulnerability_Created, prisma_1.TriggerEnum.Vulnerability_Updated),
    },
});
// detects apiKey.lastRequest updates and then updates connector.lastRequest
exports.updateConnectorExtension = prisma_1.Prisma.defineExtension(function (client) {
    return client.$extends({
        name: "updateApiKeyConnectorLastRequest",
        query: {
            apikey: {
                update: function (_a) {
                    return __awaiter(this, arguments, void 0, function (_b) {
                        var result, lastRequest;
                        var _c;
                        var args = _b.args, query = _b.query;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0: return [4 /*yield*/, query(args)];
                                case 1:
                                    result = _d.sent();
                                    lastRequest = (_c = args.data) === null || _c === void 0 ? void 0 : _c.lastRequest;
                                    if (!lastRequest) return [3 /*break*/, 3];
                                    return [4 /*yield*/, client.apiKeyConnector
                                            .update({
                                            where: { apiKeyId: result.id },
                                            data: { lastRequest: lastRequest },
                                        })
                                            .catch(function (error) {
                                            console.error("updateConnectorExtension failed to update Api Key Connector", error.message);
                                        })];
                                case 2:
                                    _d.sent();
                                    _d.label = 3;
                                case 3: return [2 /*return*/, result];
                            }
                        });
                    });
                },
            },
        },
    });
});
