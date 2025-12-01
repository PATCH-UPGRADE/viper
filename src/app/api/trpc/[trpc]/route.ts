import { createTRPCContext } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/_app";
import { createOpenApiFetchHandler } from "trpc-to-openapi";

// docs: https://github.com/mcampa/trpc-to-openapi/blob/HEAD/examples/with-nextjs-appdir
const handler = (req: Request) => {
  // Handle incoming OpenAPI requests
  return createOpenApiFetchHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext: createTRPCContext,
    req,
  });
};

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
  handler as HEAD,
};
