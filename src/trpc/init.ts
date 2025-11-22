import { getSession } from '@/lib/auth-utils';
import { TRPC_TRANSFORMER } from '@/lib/trpc-config';
import { initTRPC, TRPCError } from '@trpc/server';
import { cache } from 'react';
import type { OpenApiMeta } from 'trpc-to-openapi';

export const createTRPCContext = cache(async () => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return { userId: 'user_123' };
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

  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Unathorized",
    });
  }

  return next({ ctx: { ...ctx, auth: session } });
});
