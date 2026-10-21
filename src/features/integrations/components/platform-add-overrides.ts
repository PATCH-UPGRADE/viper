import type { ComponentType } from "react";
import type { PlatformEnum } from "@/generated/prisma";
import type { CatalogEntry } from "../core/catalog";
import { CsvUploadAddButton } from "../platforms/csv-upload/components/csv-import-buttons";

export const PLATFORM_ADD_OVERRIDES: Partial<
  Record<PlatformEnum, ComponentType<{ entry: CatalogEntry }>>
> = {
  CSV_UPLOAD: CsvUploadAddButton,
};
