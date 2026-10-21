import "server-only";
import { createTRPCRouter } from "@/trpc/init";
import { importProcedures } from "./import-procedures";
import { mappingProcedures } from "./mapping-procedures";

export const csvImportRouter = createTRPCRouter({
  ...mappingProcedures,
  ...importProcedures,
});
