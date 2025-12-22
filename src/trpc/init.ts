import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import type { OpenApiMeta } from "trpc-to-openapi";
import { getSession, verifyApiKey } from "@/lib/auth-utils";
import { TRPC_TRANSFORMER } from "@/lib/trpc-config";

export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return { req: opts.req };
};

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

export const createOpenApiContext = async ({
  req,
  // biome-ignore lint/suspicious/noExplicitAny: TS gets mad at casting Request to NextRequest. possible TODO?
}: FetchCreateContextFnOptions): Promise<any> => {
  return { req };
};

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.context<Context>().meta<OpenApiMeta>().create({
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

  // @ts-expect-error
  const { valid, error, key } = await verifyApiKey(ctx.req as Request);

  if (valid && key && !error) {
    return next({ ctx: { ...ctx, auth: { user: { id: key.userId } } } });
  }

  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "Unauthorized",
  });
});
