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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
var prisma_1 = require("@/generated/prisma");
var db_1 = require("../src/lib/db");
var CISA_INTEGRATION = {
    name: "CISA CSAF",
    platform: "CISA",
    integrationUri: "https://www.cisa.gov/sites/default/files/csaf/provider-metadata.json",
    integrationType: prisma_1.IntegrationType.CSAF,
    authType: prisma_1.AuthType.None,
    resourceType: prisma_1.ResourceType.Vulnerability,
    syncEvery: 6 * 60 * 60, // 21600 seconds = 6 hours
};
function createOrGetCisaIntegration(seedUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, integrationUser;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.default.integration.findFirst({
                        where: { integrationUri: CISA_INTEGRATION.integrationUri },
                        include: { integrationUser: true },
                    })];
                case 1:
                    existing = _a.sent();
                    if (existing === null || existing === void 0 ? void 0 : existing.integrationUser) {
                        console.log("✅ Found existing CISA integration user");
                        return [2 /*return*/, existing.integrationUser];
                    }
                    return [4 /*yield*/, db_1.default.user.create({
                            data: { id: crypto.randomUUID(), name: CISA_INTEGRATION.name },
                        })];
                case 2:
                    integrationUser = _a.sent();
                    return [4 /*yield*/, db_1.default.integration.create({
                            data: __assign(__assign({}, CISA_INTEGRATION), { userId: seedUserId, integrationUserId: integrationUser.id }),
                        })];
                case 3:
                    _a.sent();
                    console.log("✅ Created CISA CSAF integration and integration user");
                    return [2 /*return*/, integrationUser];
            }
        });
    });
}
var SEED_USER = {
    email: "user@example.com",
};
var DEVICE_GROUP = {
    vendor: "Baxter",
    product: "Life2000 Ventilation System",
    version: "06.08.00.00",
};
var DEVICE_GROUP_CPE = "cpe:2.3:h:baxter:life2000_ventilation_system:06.08.00.00:*:*:*:*:*:*:*";
// Canonical resolvers (canonicalName is @unique → upsert is race-safe).
function upsertVendor(name) {
    var canonicalName = name.trim().toLowerCase();
    return db_1.default.vendor.upsert({
        where: { canonicalName: canonicalName },
        update: {},
        create: { canonicalName: canonicalName, canonicalDisplayName: name, hasCpe: true },
    });
}
function upsertProduct(name) {
    var canonicalName = name.trim().toLowerCase();
    return db_1.default.product.upsert({
        where: { canonicalName: canonicalName },
        update: {},
        create: { canonicalName: canonicalName, canonicalDisplayName: name, hasCpe: true },
    });
}
function upsertVersion(name) {
    var canonicalName = name.trim().toLowerCase();
    return db_1.default.version.upsert({
        where: { canonicalName: canonicalName },
        update: {},
        create: { canonicalName: canonicalName, canonicalDisplayName: name, hasCpe: true },
    });
}
// Find-or-create a shared DeviceGroupMatching for a device-group identity.
function matchingIdFor(dg) {
    return __awaiter(this, void 0, void 0, function () {
        var where, existing, matching, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    where = {
                        vendorId: (_b = dg.vendorId) !== null && _b !== void 0 ? _b : "",
                        productId: dg.productId,
                        versionId: dg.versionId,
                        versionRange: null,
                    };
                    return [4 /*yield*/, db_1.default.deviceGroupMatching.findFirst({ where: where })];
                case 1:
                    existing = _c.sent();
                    if (!(existing !== null && existing !== void 0)) return [3 /*break*/, 2];
                    _a = existing;
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, db_1.default.deviceGroupMatching.create({ data: where })];
                case 3:
                    _a = (_c.sent());
                    _c.label = 4;
                case 4:
                    matching = _a;
                    return [2 /*return*/, matching.id];
            }
        });
    });
}
var ASSETS = [
    {
        ip: "192.168.30.11",
        networkSegment: "ICU-VENT",
        role: "Ventilator",
        upstreamApi: "https://www.baxter.com/product-security",
        hostname: "icu-vent-01",
        macAddress: "00:1A:2B:3C:4D:01",
        serialNumber: "L2K-2024-00001",
        location: {
            facility: "Main Hospital",
            building: "Tower A",
            floor: "3",
            room: "ICU-301",
        },
        status: "Active",
    },
    {
        ip: "192.168.30.12",
        networkSegment: "ICU-VENT",
        role: "Ventilator",
        upstreamApi: "https://www.baxter.com/product-security",
        hostname: "icu-vent-02",
        macAddress: "00:1A:2B:3C:4D:02",
        serialNumber: "L2K-2024-00002",
        location: {
            facility: "Main Hospital",
            building: "Tower A",
            floor: "3",
            room: "ICU-302",
        },
        status: "Active",
    },
    {
        ip: "192.168.30.13",
        networkSegment: "ICU-VENT",
        role: "Ventilator",
        upstreamApi: "https://www.baxter.com/product-security",
        hostname: "icu-vent-03",
        macAddress: "00:1A:2B:3C:4D:03",
        serialNumber: "L2K-2024-00003",
        location: {
            facility: "Main Hospital",
            building: "Tower A",
            floor: "3",
            room: "ICU-303",
        },
        status: "Active",
    },
    {
        ip: "192.168.30.14",
        networkSegment: "ICU-VENT",
        role: "Ventilator",
        upstreamApi: "https://www.baxter.com/product-security",
        hostname: "icu-vent-04",
        macAddress: "00:1A:2B:3C:4D:04",
        serialNumber: "L2K-2024-00004",
        location: {
            facility: "Main Hospital",
            building: "Tower B",
            floor: "2",
            room: "PICU-201",
        },
        status: "Active",
    },
    {
        ip: "192.168.30.15",
        networkSegment: "ICU-VENT",
        role: "Ventilator",
        upstreamApi: "https://www.baxter.com/product-security",
        hostname: "icu-vent-05",
        macAddress: "00:1A:2B:3C:4D:05",
        serialNumber: "L2K-2024-00005",
        location: {
            facility: "Main Hospital",
            building: "Tower B",
            floor: "2",
            room: "PICU-202",
        },
        status: "Maintenance",
    },
];
var VULNERABILITIES = [
    {
        cveId: "CVE-2024-9834",
        severity: prisma_1.Severity.Critical,
        cvssScore: 9.3,
        cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
        description: "Improper data protection on the ventilator's serial interface could allow an attacker to send and receive messages that result in unauthorized disclosure of information and/or have unintended impacts on device settings and performance.",
        narrative: "An attacker with physical access to the serial interface can intercept and inject unencrypted messages, potentially altering ventilator settings or extracting patient data without detection. This is particularly dangerous in ICU environments where ventilators are life-critical devices.",
        impact: "Unauthorized disclosure of patient respiratory data and potential disruption of ventilator function in life-critical ICU settings.",
        affectedComponents: ["Serial Interface"],
        priority: prisma_1.Priority.Critical,
        inKEV: false,
        sarif: {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "CISA ICS-CERT" } },
                    results: [
                        {
                            ruleId: "CVE-2024-9834",
                            level: "error",
                            message: {
                                text: "Cleartext transmission of sensitive information via serial interface on Baxter Life2000 Ventilation System",
                            },
                        },
                    ],
                },
            ],
        },
    },
    {
        cveId: "CVE-2024-9832",
        severity: prisma_1.Severity.Critical,
        cvssScore: 9.3,
        cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
        description: "There is no limit on the number of failed login attempts permitted with the Clinician Password or the Serial Number Clinician Password. An attacker could execute a brute-force attack to gain unauthorized access to the ventilator, and then make changes to device settings that could disrupt the function of the device and/or result in unauthorized information disclosure.",
        narrative: "Without any lockout mechanism, an attacker can systematically try all possible clinician passwords via the serial interface. Once authenticated, they gain full clinician-level control over the device, able to modify ventilation parameters such as tidal volume, respiratory rate, and PEEP without triggering any alerts.",
        impact: "Full unauthorized clinician-level access to ventilator controls, enabling arbitrary modification of life-critical ventilation parameters.",
        affectedComponents: ["Authentication", "Serial Interface"],
        priority: prisma_1.Priority.Critical,
        inKEV: false,
        sarif: {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "CISA ICS-CERT" } },
                    results: [
                        {
                            ruleId: "CVE-2024-9832",
                            level: "error",
                            message: {
                                text: "No brute-force protection on clinician authentication in Baxter Life2000 Ventilation System",
                            },
                        },
                    ],
                },
            ],
        },
    },
    {
        cveId: "CVE-2024-48971",
        severity: prisma_1.Severity.Critical,
        cvssScore: 9.3,
        cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
        description: "The Clinician Password and Serial Number Clinician Password are hard-coded into the ventilator in plaintext form. This could allow an attacker to obtain the password off the ventilator and use it to gain unauthorized access to the device, with clinician privileges.",
        narrative: "Hard-coded credentials in firmware are extractable via JTAG or serial debug access (see related CVEs). Once extracted, the same password applies across all Life2000 units of this firmware version deployed hospital-wide — a single extraction compromises the entire fleet.",
        impact: "Fleet-wide credential compromise; any attacker who extracts the hard-coded password gains clinician access to all deployed Life2000 units running this firmware version.",
        affectedComponents: ["Firmware", "Authentication"],
        priority: prisma_1.Priority.Critical,
        inKEV: false,
        sarif: {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "CISA ICS-CERT" } },
                    results: [
                        {
                            ruleId: "CVE-2024-48971",
                            level: "error",
                            message: {
                                text: "Hard-coded credentials stored in plaintext firmware on Baxter Life2000 Ventilation System",
                            },
                        },
                    ],
                },
            ],
        },
    },
    {
        cveId: "CVE-2024-48973",
        severity: prisma_1.Severity.Critical,
        cvssScore: 9.3,
        cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
        description: "The debug port on the ventilator's serial interface is enabled by default. This could allow an attacker to send and receive messages over the debug port (which are unencrypted) that result in unauthorized disclosure of information and/or have unintended impacts on device settings and performance.",
        narrative: "The always-on debug port provides an unauthenticated, unencrypted channel into the device. Combined with the cleartext serial interface (CVE-2024-9834), this creates a high-bandwidth attack surface for any person with brief physical access to the device.",
        impact: "Unauthenticated access to device internals via debug port, enabling information disclosure and device manipulation without leaving audit traces.",
        affectedComponents: ["Debug Interface", "Serial Interface"],
        priority: prisma_1.Priority.Critical,
        inKEV: false,
        sarif: {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "CISA ICS-CERT" } },
                    results: [
                        {
                            ruleId: "CVE-2024-48973",
                            level: "error",
                            message: {
                                text: "Debug port enabled by default on serial interface of Baxter Life2000 Ventilation System",
                            },
                        },
                    ],
                },
            ],
        },
    },
    {
        cveId: "CVE-2024-48974",
        severity: prisma_1.Severity.Critical,
        cvssScore: 9.3,
        cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
        description: "The ventilator does not perform proper file integrity checks when adopting firmware updates. This makes it possible for an attacker to force unauthorized changes to the device's configuration settings and/or compromise device functionality by pushing a compromised/illegitimate firmware file.",
        narrative: "With no cryptographic verification on firmware images, an attacker who gains serial access can push malicious firmware that silently alters ventilation behavior — for example, capping oxygen delivery or disabling alarms — while appearing functional to clinical staff.",
        impact: "Persistent device compromise via malicious firmware; attacker-controlled ventilation behavior with no detection mechanism for clinical staff.",
        affectedComponents: ["Firmware Update", "Integrity Check"],
        priority: prisma_1.Priority.Critical,
        inKEV: false,
        sarif: {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "CISA ICS-CERT" } },
                    results: [
                        {
                            ruleId: "CVE-2024-48974",
                            level: "error",
                            message: {
                                text: "No firmware integrity check on updates for Baxter Life2000 Ventilation System",
                            },
                        },
                    ],
                },
            ],
        },
    },
    {
        cveId: "CVE-2024-48970",
        severity: prisma_1.Severity.Critical,
        cvssScore: 9.3,
        cvssVector: "CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
        description: "The ventilator's microcontroller lacks memory protection. An attacker could connect to the internal JTAG interface and read or write to flash memory using an off-the-shelf debugging tool, which could disrupt the function of the device and/or cause unauthorized information disclosure.",
        narrative: "JTAG access with no memory protection means an attacker with a ~$20 hardware debugger can dump the entire firmware image, extract hard-coded credentials, and modify memory at runtime. This is the root-cause enabler for multiple other CVEs in this advisory.",
        impact: "Complete firmware extraction and runtime memory manipulation via JTAG; root-cause vulnerability enabling exploitation of CVE-2024-48971 (hard-coded credentials) and CVE-2024-48974 (unsigned firmware).",
        affectedComponents: [
            "Microcontroller",
            "JTAG Interface",
            "Memory Protection",
        ],
        priority: prisma_1.Priority.Critical,
        inKEV: false,
        sarif: {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "CISA ICS-CERT" } },
                    results: [
                        {
                            ruleId: "CVE-2024-48970",
                            level: "error",
                            message: {
                                text: "Microcontroller lacks memory protection — JTAG flash read/write on Baxter Life2000 Ventilation System",
                            },
                        },
                    ],
                },
            ],
        },
    },
    {
        cveId: "CVE-2020-8004",
        severity: prisma_1.Severity.High,
        cvssScore: 7.5,
        cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
        description: "The flash memory read-out protection feature on the microcontroller does not block memory access via the ICode bus. Attackers can exploit this in conjunction with certain CPU exception handling behaviors to gain knowledge of how the onboard flash memory is organized and ultimately bypass read-out protection to expose memory contents.",
        narrative: "This microcontroller-level flaw predates the device's deployment and has been known since 2020. The ICode bus bypass allows reading protected flash regions by triggering specific CPU exception states — no specialized hardware required beyond basic JTAG access already enabled by CVE-2024-48970.",
        impact: "Bypass of flash read-out protection, exposing full firmware contents including hard-coded credentials and proprietary clinical algorithms.",
        affectedComponents: [
            "Microcontroller",
            "Flash Memory",
            "Read-out Protection",
        ],
        priority: prisma_1.Priority.High,
        inKEV: false,
        sarif: {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "CISA ICS-CERT" } },
                    results: [
                        {
                            ruleId: "CVE-2020-8004",
                            level: "warning",
                            message: {
                                text: "Flash read-out protection bypass via ICode bus on microcontroller in Baxter Life2000 Ventilation System",
                            },
                        },
                    ],
                },
            ],
        },
    },
    {
        cveId: "CVE-2024-48966",
        severity: prisma_1.Severity.Critical,
        cvssScore: 10.0,
        cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
        description: "The software tools used by service personnel to test & calibrate the ventilator do not support user authentication. An attacker with access to the Service PC where the tools are installed could obtain diagnostic information through the test tool or manipulate the ventilator's settings and embedded software via the calibration tool, without having to authenticate to either tool.",
        narrative: "Service PCs in hospital biomedical engineering departments are often shared, lightly secured workstations. An attacker with brief access to such a workstation can use the unauthenticated service tools to fully reconfigure any Life2000 unit the PC has been connected to, with no credential barrier whatsoever.",
        impact: "Full unauthenticated control over ventilator settings and embedded software via service tooling; anyone with service PC access can silently alter device calibration or compromise device software.",
        affectedComponents: [
            "Service Tools",
            "Calibration Software",
            "Authentication",
        ],
        priority: prisma_1.Priority.Critical,
        inKEV: false,
        sarif: {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "CISA ICS-CERT" } },
                    results: [
                        {
                            ruleId: "CVE-2024-48966",
                            level: "error",
                            message: {
                                text: "No authentication on service/calibration tools for Baxter Life2000 Ventilation System",
                            },
                        },
                    ],
                },
            ],
        },
    },
    {
        cveId: "CVE-2024-48967",
        severity: prisma_1.Severity.Critical,
        cvssScore: 10.0,
        cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
        description: "The ventilator and the Service PC lack sufficient audit logging capabilities to allow for detection of malicious activity and subsequent forensic examination. An attacker with access to the ventilator and/or the Service PC could, without detection, make unauthorized changes to ventilator settings that result in unauthorized disclosure of information and/or have unintended impacts on device performance.",
        narrative: "The absence of audit logging means that any exploitation of the other vulnerabilities in this advisory leaves no forensic trace. Security teams cannot determine if a device has been tampered with, making incident response and post-event investigation impossible without physical device inspection.",
        impact: "No detection or forensic capability for malicious activity; exploitation of any other CVE in this advisory is completely invisible to security monitoring and incident response teams.",
        affectedComponents: ["Audit Logging", "Forensics"],
        priority: prisma_1.Priority.Critical,
        inKEV: false,
        sarif: {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "CISA ICS-CERT" } },
                    results: [
                        {
                            ruleId: "CVE-2024-48967",
                            level: "error",
                            message: {
                                text: "Insufficient audit logging on ventilator and Service PC for Baxter Life2000 Ventilation System",
                            },
                        },
                    ],
                },
            ],
        },
    },
];
var CSAF_REMEDIATIONS = [
    {
        category: "mitigation",
        details: "Baxter plans to issue a follow-up announcement in Q2 2025 regarding the Life2000 vulnerabilities described in this disclosure.",
        product_ids: ["CSAFPID-0001"],
    },
    {
        category: "mitigation",
        details: "Baxter is unaware of any exploitation of these vulnerabilities and/or the compromise of personal or health data.",
        product_ids: ["CSAFPID-0001"],
    },
    {
        category: "vendor_fix",
        details: "Baxter recommends that users of the Life2000 Ventilation System not leave their ventilators unattended in public or unsecured areas. Maintaining physical possession and control of the ventilator reduces the likelihood of a malicious actor gaining access to the device.",
        product_ids: ["CSAFPID-0001"],
    },
    {
        category: "mitigation",
        details: "For more information, refer to Baxter's Product Security and Responsible Disclosures web page.",
        product_ids: ["CSAFPID-0001"],
        url: "https://www.baxter.com/product-security",
    },
];
var CSAF_JSON = {
    document: {
        acknowledgments: [
            { names: ["Baxter"], summary: "reporting these vulnerabilities to CISA" },
        ],
        category: "csaf_security_advisory",
        csaf_version: "2.0",
        distribution: {
            text: "Disclosure is not limited",
            tlp: { label: "WHITE", url: "https://us-cert.cisa.gov/tlp/" },
        },
        lang: "en-US",
        notes: [
            {
                category: "legal_disclaimer",
                text: 'All information products included in https://us-cert.cisa.gov/ics are provided "as is" for informational purposes only.',
                title: "Legal Notice",
            },
            {
                category: "summary",
                text: "Successful exploitation of these vulnerabilities could lead to information disclosure and/or disruption of the device's function without detection.",
                title: "Risk evaluation",
            },
            {
                category: "other",
                text: "Healthcare and Public Health",
                title: "Critical infrastructure sectors",
            },
            {
                category: "other",
                text: "United States",
                title: "Countries/areas deployed",
            },
            {
                category: "other",
                text: "United States",
                title: "Company headquarters location",
            },
        ],
        publisher: {
            category: "coordinator",
            contact_details: "central@cisa.dhs.gov",
            name: "CISA",
            namespace: "https://www.cisa.gov/",
        },
        references: [
            {
                category: "self",
                summary: "ICS Advisory ICSMA-24-319-01 JSON",
                url: "https://raw.githubusercontent.com/cisagov/CSAF/develop/csaf_files/OT/white/2024/icsma-24-319-01.json",
            },
            {
                category: "self",
                summary: "ICSA Advisory ICSMA-24-319-01 - Web Version",
                url: "https://www.cisa.gov/news-events/ics-medical-advisories/icsma-24-319-01",
            },
        ],
        title: "Baxter Life2000 Ventilation System",
        tracking: {
            current_release_date: "2024-11-14T07:00:00.000000Z",
            generator: { engine: { name: "CISA CSAF Generator", version: "1.0.0" } },
            id: "ICSMA-24-319-01",
            initial_release_date: "2024-11-14T07:00:00.000000Z",
            revision_history: [
                {
                    date: "2024-11-14T07:00:00.000000Z",
                    legacy_version: "Initial",
                    number: "1",
                    summary: "Initial Publication",
                },
            ],
            status: "final",
            version: "1",
        },
    },
    product_tree: {
        branches: [
            {
                branches: [
                    {
                        branches: [
                            {
                                category: "product_version_range",
                                name: "<=06.08.00.00",
                                product: {
                                    name: "Baxter Life2000 Ventilation System: <=06.08.00.00",
                                    product_id: "CSAFPID-0001",
                                },
                            },
                        ],
                        category: "product_name",
                        name: "Life2000 Ventilation System",
                    },
                ],
                category: "vendor",
                name: "Baxter",
            },
        ],
    },
    vulnerabilities: VULNERABILITIES.map(function (v) { return ({
        cve: v.cveId,
        notes: [
            {
                category: "summary",
                text: v.description,
                title: "Vulnerability Summary",
            },
        ],
        product_status: { known_affected: ["CSAFPID-0001"] },
        remediations: CSAF_REMEDIATIONS,
        scores: [
            {
                cvss_v3: {
                    baseScore: v.cvssScore,
                    baseSeverity: v.severity === prisma_1.Severity.Critical ? "CRITICAL" : "HIGH",
                    vectorString: v.cvssVector,
                    version: "3.1",
                },
                products: ["CSAFPID-0001"],
            },
        ],
    }); }),
};
function createOrGetSeedUser() {
    return __awaiter(this, void 0, void 0, function () {
        var user;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n👤 Finding/creating seed user...");
                    return [4 /*yield*/, db_1.default.user.findUniqueOrThrow({
                            where: { email: SEED_USER.email },
                        })];
                case 1:
                    user = _a.sent();
                    console.log("\u2705 Found existing seed user: ".concat(SEED_USER.email));
                    return [2 /*return*/, user];
            }
        });
    });
}
function seedDeviceGroup() {
    return __awaiter(this, void 0, void 0, function () {
        var vendor, product, version, identity, existing, deviceGroup, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log("\n🌱 Upserting Baxter Life2000 device group...");
                    return [4 /*yield*/, upsertVendor(DEVICE_GROUP.vendor)];
                case 1:
                    vendor = _b.sent();
                    return [4 /*yield*/, upsertProduct(DEVICE_GROUP.product)];
                case 2:
                    product = _b.sent();
                    return [4 /*yield*/, upsertVersion(DEVICE_GROUP.version)];
                case 3:
                    version = _b.sent();
                    identity = {
                        vendorId: vendor.id,
                        productId: product.id,
                        versionId: version.id,
                        versionStatus: "KNOWN",
                    };
                    return [4 /*yield*/, db_1.default.deviceGroup.findFirst({ where: identity })];
                case 4:
                    existing = _b.sent();
                    if (!(existing !== null && existing !== void 0)) return [3 /*break*/, 5];
                    _a = existing;
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, db_1.default.deviceGroup.create({
                        data: __assign(__assign({}, identity), { cpe: [DEVICE_GROUP_CPE] }),
                    })];
                case 6:
                    _a = (_b.sent());
                    _b.label = 7;
                case 7:
                    deviceGroup = _a;
                    if (!(existing && !existing.cpe.includes(DEVICE_GROUP_CPE))) return [3 /*break*/, 9];
                    return [4 /*yield*/, db_1.default.deviceGroup.update({
                            where: { id: deviceGroup.id },
                            data: { cpe: __spreadArray(__spreadArray([], existing.cpe, true), [DEVICE_GROUP_CPE], false) },
                        })];
                case 8:
                    _b.sent();
                    _b.label = 9;
                case 9:
                    console.log("\u2705 Device group: ".concat(DEVICE_GROUP.product, " (").concat(deviceGroup.id, ")"));
                    return [2 /*return*/, deviceGroup];
            }
        });
    });
}
function seedAssets(userId, deviceGroupId) {
    return __awaiter(this, void 0, void 0, function () {
        var assets;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n🌱 Seeding assets...");
                    return [4 /*yield*/, Promise.all(ASSETS.map(function (asset) { return __awaiter(_this, void 0, void 0, function () {
                            var existing;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, db_1.default.asset.findFirst({
                                            where: { serialNumber: asset.serialNumber },
                                        })];
                                    case 1:
                                        existing = _a.sent();
                                        if (existing)
                                            return [2 /*return*/, existing];
                                        return [2 /*return*/, db_1.default.asset.create({ data: __assign(__assign({}, asset), { deviceGroupId: deviceGroupId, userId: userId }) })];
                                }
                            });
                        }); }))];
                case 1:
                    assets = _a.sent();
                    console.log("\u2705 Seeded ".concat(assets.length, " assets"));
                    return [2 /*return*/, assets];
            }
        });
    });
}
function seedVulnerabilities(userId, deviceGroup) {
    return __awaiter(this, void 0, void 0, function () {
        var matchingId, vulns;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n🌱 Seeding vulnerabilities...");
                    return [4 /*yield*/, matchingIdFor(deviceGroup)];
                case 1:
                    matchingId = _a.sent();
                    return [4 /*yield*/, Promise.all(VULNERABILITIES.map(function (_a) { return __awaiter(_this, void 0, void 0, function () {
                            var existing;
                            var data = __rest(_a, []);
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0: return [4 /*yield*/, db_1.default.vulnerability.findFirst({
                                            where: { cveId: data.cveId },
                                        })];
                                    case 1:
                                        existing = _b.sent();
                                        if (existing)
                                            return [2 /*return*/, existing];
                                        return [2 /*return*/, db_1.default.vulnerability.create({
                                                data: __assign(__assign({}, data), { userId: userId, deviceGroupMatchings: { connect: { id: matchingId } } }),
                                            })];
                                }
                            });
                        }); }))];
                case 2:
                    vulns = _a.sent();
                    console.log("\u2705 Seeded ".concat(vulns.length, " vulnerabilities"));
                    return [2 /*return*/, vulns];
            }
        });
    });
}
function seedAdvisory(userId, deviceGroup, vulnIds) {
    return __awaiter(this, void 0, void 0, function () {
        var UPSTREAM_URL, matchingId, advisory;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n🌱 Upserting advisory...");
                    UPSTREAM_URL = "https://raw.githubusercontent.com/cisagov/CSAF/develop/csaf_files/OT/white/2024/icsma-24-319-01.json";
                    return [4 /*yield*/, matchingIdFor(deviceGroup)];
                case 1:
                    matchingId = _a.sent();
                    return [4 /*yield*/, db_1.default.advisory.upsert({
                            where: { upstreamUrl: UPSTREAM_URL },
                            update: {
                                title: "Baxter Life2000 Ventilation System",
                                severity: prisma_1.Severity.Critical,
                                tlp: prisma_1.Tlp.WHITE,
                                summary: "Successful exploitation of these vulnerabilities could lead to information disclosure and/or disruption of the device's function without detection.",
                                publishedAt: new Date("2024-11-14T07:00:00.000Z"),
                                status: prisma_1.IssueStatus.ACTIVE,
                                csaf: CSAF_JSON,
                                referencedVulnerabilities: {
                                    set: vulnIds.map(function (id) { return ({ id: id }); }),
                                },
                                deviceGroupMatchings: {
                                    set: [{ id: matchingId }],
                                },
                            },
                            create: {
                                userId: userId,
                                title: "Baxter Life2000 Ventilation System",
                                severity: prisma_1.Severity.Critical,
                                tlp: prisma_1.Tlp.WHITE,
                                upstreamUrl: UPSTREAM_URL,
                                summary: "Successful exploitation of these vulnerabilities could lead to information disclosure and/or disruption of the device's function without detection.",
                                publishedAt: new Date("2024-11-14T07:00:00.000Z"),
                                status: prisma_1.IssueStatus.ACTIVE,
                                csaf: CSAF_JSON,
                                referencedVulnerabilities: {
                                    connect: vulnIds.map(function (id) { return ({ id: id }); }),
                                },
                                deviceGroupMatchings: {
                                    connect: [{ id: matchingId }],
                                },
                            },
                        })];
                case 2:
                    advisory = _a.sent();
                    console.log("\u2705 Advisory upserted: ".concat(advisory.title, " (").concat(advisory.id, ")"));
                    return [2 /*return*/, advisory];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var user, integrationUser, deviceGroup, vulns;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("🚀 Seeding ICSMA-24-319-01: Baxter Life2000 Ventilation System\n");
                    return [4 /*yield*/, createOrGetSeedUser()];
                case 1:
                    user = _a.sent();
                    return [4 /*yield*/, createOrGetCisaIntegration(user.id)];
                case 2:
                    integrationUser = _a.sent();
                    return [4 /*yield*/, seedDeviceGroup()];
                case 3:
                    deviceGroup = _a.sent();
                    return [4 /*yield*/, seedAssets(user.id, deviceGroup.id)];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, seedVulnerabilities(integrationUser.id, deviceGroup)];
                case 5:
                    vulns = _a.sent();
                    return [4 /*yield*/, seedAdvisory(integrationUser.id, deviceGroup, vulns.map(function (v) { return v.id; }))];
                case 6:
                    _a.sent();
                    console.log("\n✨ Done.");
                    return [4 /*yield*/, db_1.default.$disconnect()];
                case 7:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    console.error(err);
    db_1.default.$disconnect();
    process.exit(1);
});
