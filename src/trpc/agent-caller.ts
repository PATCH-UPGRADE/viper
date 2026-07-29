import "server-only";
import { createCallerFactory } from "./init";
import { appRouter } from "./routers/_app";

const createCaller = createCallerFactory(appRouter);

/**
 * An in-process, authenticated tRPC caller for the chat agent's data-access
 * tool. It injects the agent's userId as a trusted `auth` context so
 * protectedProcedure short-circuits without a session cookie or API key (see
 * src/trpc/init.ts).
 */
export function createAgentCaller(userId: string) {
  return createCaller({
    // biome-ignore lint/suspicious/noExplicitAny: no real request in-process
    req: undefined as any,
    auth: { user: { id: userId } },
  });
}
