"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaginationParams = createPaginationParams;
var server_1 = require("nuqs/server");
var constants_1 = require("@/config/constants");
/**
 * Creates standard pagination URL state parameters
 * Use this for all list pages that need pagination and search
 */
function createPaginationParams() {
    return {
        page: server_1.parseAsInteger
            .withDefault(constants_1.PAGINATION.DEFAULT_PAGE)
            .withOptions({ clearOnDefault: true }),
        pageSize: server_1.parseAsInteger
            .withDefault(constants_1.PAGINATION.DEFAULT_PAGE_SIZE)
            .withOptions({ clearOnDefault: true }),
        search: server_1.parseAsString.withDefault("").withOptions({ clearOnDefault: true }),
        sort: server_1.parseAsString.withDefault("").withOptions({ clearOnDefault: true }),
        lastUpdatedStartTime: server_1.parseAsString
            .withDefault("")
            .withOptions({ clearOnDefault: true }),
        lastUpdatedEndTime: server_1.parseAsString
            .withDefault("")
            .withOptions({ clearOnDefault: true }),
    };
}
