import { parseAsInteger, parseAsString } from "nuqs/server";

export const emulatorsParams = {
  page: parseAsInteger.withDefault(1).withOptions({ clearOnDefault: true }),
  pageSize: parseAsInteger.withDefault(5).withOptions({ clearOnDefault: true }),
  search: parseAsString.withDefault("").withOptions({ clearOnDefault: true }),
};
