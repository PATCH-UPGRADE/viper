import { parseAsStringEnum } from "nuqs/server";
import { Priority } from "@/generated/prisma";
import { createPaginationParams } from "@/lib/url-state";

export const vulnerabilitiesParams = createPaginationParams();

export const vulnerabilitiesByPriorityParams = {
  ...createPaginationParams(),
  priority: parseAsStringEnum(Object.values(Priority))
    .withDefault("Critical")
    .withOptions({ clearOnDefault: true }),
};
