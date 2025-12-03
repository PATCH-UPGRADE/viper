import { createOpenApiContext } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/_app";
import { type NextRequest } from "next/server";
import { createOpenApiFetchHandler } from "trpc-to-openapi";

// docs: https://github.com/mcampa/trpc-to-openapi/blob/HEAD/examples/with-nextjs-appdir
const handler = (req: NextRequest) => {
  // Handle incoming OpenAPI requests
  return createOpenApiFetchHandler({
    endpoint: "/api/v1",
    router: appRouter,
    createContext: createOpenApiContext,
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
