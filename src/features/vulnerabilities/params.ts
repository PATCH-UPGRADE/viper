"use client";

import { parseAsStringEnum } from "nuqs";
import { Severity } from "@/generated/prisma";
import { createPaginationParams } from "@/lib/url-state";

export const vulnerabilitiesParams = createPaginationParams();

export const vulnerabilitiesBySeverityParams = {
  ...createPaginationParams(),
  severity: parseAsStringEnum(Object.values(Severity))
    .withDefault("Critical")
    .withOptions({ clearOnDefault: true }),
};
