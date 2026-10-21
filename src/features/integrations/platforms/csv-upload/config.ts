import { z } from "zod";

export const configSchema = z.object({});
export type CsvUploadConfig = z.infer<typeof configSchema>;

export const credentialSchema = z.object({});
export type CsvUploadCreds = z.infer<typeof credentialSchema>;
