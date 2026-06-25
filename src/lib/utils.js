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
exports.sendWebhook = exports.parseAuthenticationJson = void 0;
exports.cn = cn;
exports.plural = plural;
exports.formatFileSize = formatFileSize;
var clsx_1 = require("clsx");
var tailwind_merge_1 = require("tailwind-merge");
var prisma_1 = require("@/generated/prisma");
var schemas_1 = require("./schemas");
function cn() {
    var inputs = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        inputs[_i] = arguments[_i];
    }
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
function plural(s, count) {
    if (count === 1) {
        return s;
    }
    // handle y
    if (s.endsWith("y")) {
        var secondLastChar = s.charAt(s.length - 2);
        // example: vulnerability -> vulnerabilities, but day -> days
        if (/[^aeiou]/i.test(secondLastChar)) {
            return "".concat(s.slice(0, -1), "ies");
        }
        return "".concat(s, "s");
    }
    return "".concat(s, "s");
}
var parseAuthenticationJson = function (itemWithAuth) {
    if (itemWithAuth.authType === prisma_1.AuthType.Basic) {
        // TODO: authentication needs to be encrypted/protected somehow
        var parsed = schemas_1.basicAuthSchema.safeParse(itemWithAuth.authentication);
        if (!parsed.success) {
            throw new Error("Invalid Basic auth configuration");
        }
        var _a = parsed.data, username = _a.username, password = _a.password;
        var token = Buffer.from("".concat(username, ":").concat(password)).toString("base64");
        return { header: "Authorization", value: "Basic ".concat(token) };
    }
    else if (itemWithAuth.authType === prisma_1.AuthType.Bearer) {
        var parsed = schemas_1.bearerAuthSchema.safeParse(itemWithAuth.authentication);
        if (!parsed.success) {
            throw new Error("Invalid Bearer auth configuration");
        }
        return { header: "Authorization", value: "Bearer ".concat(parsed.data.token) };
    }
    else if (itemWithAuth.authType === prisma_1.AuthType.Header) {
        var parsed = schemas_1.headerAuthSchema.safeParse(itemWithAuth.authentication);
        if (!parsed.success) {
            throw new Error("Invalid Header auth configuration");
        }
        return { header: parsed.data.header, value: parsed.data.value };
    }
    throw new Error("Invalid auth configuration");
};
exports.parseAuthenticationJson = parseAuthenticationJson;
// WARN: need to seperate this function out of prisma-extensions
// because tests will load up the prisma extensions before
// the client is ready - creating a hard-to-debug test error
var sendWebhook = function (triggerType, timestamp, webhook) { return __awaiter(void 0, void 0, void 0, function () {
    var headers, _a, header, value;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                headers = {
                    "Content-Type": "application/json",
                };
                if (webhook.authType !== prisma_1.AuthType.None) {
                    _a = (0, exports.parseAuthenticationJson)(webhook), header = _a.header, value = _a.value;
                    headers[header] = value;
                }
                return [4 /*yield*/, fetch(webhook.callbackUrl, {
                        method: "POST",
                        headers: headers,
                        signal: AbortSignal.timeout(30000),
                        body: JSON.stringify({
                            webhookTrigger: triggerType.toString(),
                            timestamp: timestamp.toISOString(),
                        }),
                    })];
            case 1: return [2 /*return*/, _b.sent()];
        }
    });
}); };
exports.sendWebhook = sendWebhook;
function formatFileSize(bytes) {
    if (bytes === 0)
        return "0 Bytes";
    var k = 1024;
    var sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return "".concat(parseFloat((bytes / Math.pow(k, i)).toFixed(2)), " ").concat(sizes[i]);
}
