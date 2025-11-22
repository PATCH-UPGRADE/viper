import { parseAsInteger, parseAsString } from "nuqs/server";
import { PAGINATION } from "@/config/constants";

/**
 * Creates standard pagination URL state parameters
 * Use this for all list pages that need pagination and search
 */
export function createPaginationParams() {
  return {
    page: parseAsInteger
      .withDefault(PAGINATION.DEFAULT_PAGE)
      .withOptions({ clearOnDefault: true }),
    pageSize: parseAsInteger
      .withDefault(PAGINATION.DEFAULT_PAGE_SIZE)
      .withOptions({ clearOnDefault: true }),
    search: parseAsString
      .withDefault("")
      .withOptions({ clearOnDefault: true }),
  };
}
