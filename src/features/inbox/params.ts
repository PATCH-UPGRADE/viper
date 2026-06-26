import { parseAsArrayOf, parseAsStringEnum } from "nuqs/server";
import { NotificationType, Priority } from "@/generated/prisma";
import { createPaginationParams } from "@/lib/url-state";

export const inboxParams = {
  ...createPaginationParams(),
  priority: parseAsArrayOf(
    parseAsStringEnum(Object.values(Priority)),
  ).withDefault([]),
  type: parseAsArrayOf(
    parseAsStringEnum(Object.values(NotificationType)),
  ).withDefault([]),
};
