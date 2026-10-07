import "server-only";
import { PlatformEnum } from "@/generated/prisma";
import type { ConnectorModule } from "../../core/types";
import { assets } from "./assets";
import {
  type CsvUploadConfig,
  type CsvUploadCreds,
  configSchema,
  credentialSchema,
} from "./config";
import { CSV_UPLOAD_DISPLAY_NAME } from "./contract";

export const csvUpload: ConnectorModule<CsvUploadConfig, CsvUploadCreds> = {
  definition: {
    platform: PlatformEnum.CSV_UPLOAD,
    displayName: CSV_UPLOAD_DISPLAY_NAME,
    description:
      "Import devices from a spreadsheet export of your inventory system.",
    categories: ["Hospital Inventory"],
    unscheduled: true,
    configSchema,
    credentialSchema,
  },
  assets,
};
