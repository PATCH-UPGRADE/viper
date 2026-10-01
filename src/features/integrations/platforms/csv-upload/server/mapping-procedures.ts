import "server-only";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { protectedProcedure } from "@/trpc/init";
import {
  matchNamesInputSchema,
  matchNamesOutputSchema,
  searchNamesInputSchema,
  searchNamesOutputSchema,
  suggestMappingInputSchema,
  suggestMappingOutputSchema,
} from "../contract";

export const mappingProcedures = {
  suggestMapping: protectedProcedure
    .input(suggestMappingInputSchema)
    .output(suggestMappingOutputSchema)
    .mutation(async () => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Not implemented yet",
      });
    }),

  matchNames: protectedProcedure
    .input(matchNamesInputSchema)
    .output(matchNamesOutputSchema)
    .mutation(async () => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Not implemented yet",
      });
    }),

  searchNames: protectedProcedure
    .input(searchNamesInputSchema)
    .output(searchNamesOutputSchema)
    .query(async () => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Not implemented yet",
      });
    }),
} satisfies TRPCRouterRecord;
