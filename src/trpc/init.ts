import { getSession, verifyApiKey } from "@/lib/auth-utils";
import { TRPC_TRANSFORMER } from "@/lib/trpc-config";
import { initTRPC, TRPCError } from "@trpc/server";
import { cache } from "react";
import type { OpenApiMeta } from "trpc-to-openapi";

export const createTRPCContext = cache(async (opts: { req: Request }) => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return { req: opts.req };
});

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.meta<OpenApiMeta>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  transformer: TRPC_TRANSFORMER,
});

// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;

export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const session = await getSession();
  if (session) {
    return next({ ctx: { ...ctx, auth: session } });
  }

  const verifiedApiKey = await verifyApiKey(ctx.req.headers);

  if (verifiedApiKey) {
    return next({ ctx: { ...ctx, auth: "TODO" } });
  }

  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "Unathorized",
  });
});
