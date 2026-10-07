import "server-only";
import { createTRPCRouter } from "@/trpc/init";
import { mappingProcedures } from "./mapping-procedures";

export const csvImportRouter = createTRPCRouter({
  ...mappingProcedures,
});
