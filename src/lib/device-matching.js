"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVers = parseVers;
exports.versSatisfies = versSatisfies;
exports.matchingAppliesToDeviceGroup = matchingAppliesToDeviceGroup;
exports.deviceGroupWhereForMatching = deviceGroupWhereForMatching;
exports.matchingWhereForDeviceGroup = matchingWhereForDeviceGroup;
exports.resolveMatches = resolveMatches;
var semver_1 = require("semver");
var OPERATORS = [">=", "<=", ">", "<", "="];
/**
 * Parse a VERS range string. Returns null when the input is not a recognizable
 * VERS expression.
 */
function parseVers(range) {
    var _a;
    var trimmed = range.trim();
    if (!trimmed)
        return null;
    var scheme = "semver";
    var body = trimmed;
    if (trimmed.startsWith("vers:")) {
        var rest = trimmed.slice("vers:".length);
        var slash = rest.indexOf("/");
        if (slash === -1)
            return null;
        scheme = rest.slice(0, slash).toLowerCase();
        body = rest.slice(slash + 1);
    }
    if (scheme === "all" || body === "*" || body === "") {
        return { scheme: scheme, matchesAll: true, constraints: [] };
    }
    var constraints = [];
    var _loop_1 = function (piece) {
        var part = piece.trim();
        if (!part)
            return "continue";
        if (part === "*") {
            return { value: { scheme: scheme, matchesAll: true, constraints: [] } };
        }
        var operator = (_a = OPERATORS.find(function (op) { return part.startsWith(op); })) !== null && _a !== void 0 ? _a : "=";
        var version = part.startsWith(operator)
            ? part.slice(operator.length).trim()
            : part.trim();
        constraints.push({ operator: operator, version: version });
    };
    for (var _i = 0, _b = body.split("|"); _i < _b.length; _i++) {
        var piece = _b[_i];
        var state_1 = _loop_1(piece);
        if (typeof state_1 === "object")
            return state_1.value;
    }
    return { scheme: scheme, matchesAll: false, constraints: constraints };
}
/**
 * Whether `version` satisfies the given VERS range string. Unknown/unparseable
 * versions never satisfy a non-"all" range.
 */
function versSatisfies(version, range) {
    var parsed = parseVers(range);
    if (!parsed)
        return false;
    if (parsed.matchesAll)
        return true;
    if (!version)
        return false;
    // semver scheme: use coerced semver comparison so loose versions still work.
    if (parsed.scheme === "semver") {
        var target_1 = semver_1.default.coerce(version);
        if (!target_1) {
            return parsed.constraints.some(function (c) { return c.operator === "=" && c.version === version; });
        }
        return parsed.constraints.every(function (c) {
            var bound = semver_1.default.coerce(c.version);
            if (!bound)
                return c.version === version;
            switch (c.operator) {
                case ">=":
                    return semver_1.default.gte(target_1, bound);
                case "<=":
                    return semver_1.default.lte(target_1, bound);
                case ">":
                    return semver_1.default.gt(target_1, bound);
                case "<":
                    return semver_1.default.lt(target_1, bound);
                default:
                    return semver_1.default.eq(target_1, bound);
            }
        });
    }
    // Non-semver schemes: fall back to exact string equality on an "=" constraint.
    return parsed.constraints.some(function (c) { return c.operator === "=" && c.version === version; });
}
/**
 * Whether a matching applies to a concrete device group. Vendor/product/exact-
 * version comparisons use canonical FK ids; version-range checks use the
 * version's canonical string.
 */
function matchingAppliesToDeviceGroup(matching, deviceGroup) {
    var _a, _b;
    if (!deviceGroup.vendorId || matching.vendorId !== deviceGroup.vendorId) {
        return false;
    }
    // Wildcard product (null) matches every product of the vendor.
    if (matching.productId === null)
        return true;
    if (matching.productId !== deviceGroup.productId)
        return false;
    // Vendor + product match. Now resolve the version constraint.
    if (matching.versionId !== null) {
        return matching.versionId === deviceGroup.versionId;
    }
    if (matching.versionRange !== null) {
        return versSatisfies((_b = (_a = deviceGroup.version) === null || _a === void 0 ? void 0 : _a.canonicalName) !== null && _b !== void 0 ? _b : null, matching.versionRange);
    }
    // No version constraint => product-level match.
    return true;
}
/**
 * Prisma `where` selecting device groups a matching could apply to (vendor +
 * optional product). Version filtering is done in memory via
 * matchingAppliesToDeviceGroup.
 */
function deviceGroupWhereForMatching(matching) {
    return __assign({ vendorId: matching.vendorId }, (matching.productId !== null ? { productId: matching.productId } : {}));
}
/**
 * Prisma `where` selecting matchings that could apply to a device group: same
 * vendor, and either a wildcard product or the same product (the naive
 * same-vendor/product scan). Caller must pass a group that has a vendorId.
 */
function matchingWhereForDeviceGroup(deviceGroup) {
    return {
        vendorId: deviceGroup.vendorId,
        OR: [{ productId: null }, { productId: deviceGroup.productId }],
    };
}
/**
 * Resolve a set of matchings against candidate device groups, returning the
 * groups that any matching applies to (deduped by group id).
 */
function resolveMatches(matchings, deviceGroups) {
    var matched = new Map();
    for (var _i = 0, matchings_1 = matchings; _i < matchings_1.length; _i++) {
        var matching = matchings_1[_i];
        for (var _a = 0, deviceGroups_1 = deviceGroups; _a < deviceGroups_1.length; _a++) {
            var deviceGroup = deviceGroups_1[_a];
            if (matchingAppliesToDeviceGroup(matching, deviceGroup)) {
                matched.set(deviceGroup.id, deviceGroup);
            }
        }
    }
    return __spreadArray([], matched.values(), true);
}
