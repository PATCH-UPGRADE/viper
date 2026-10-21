import type { ResourceModule } from "../../../core/types";
import type { CsvUploadConfig, CsvUploadCreds } from "../config";

export const assets: ResourceModule<
  unknown,
  unknown,
  CsvUploadConfig,
  CsvUploadCreds
> = {
  sync: async () => {
    throw new Error("CSV Upload assets arrive only through an import");
  },
  defaultSyncEvery: null,
};
