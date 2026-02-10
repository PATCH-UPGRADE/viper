import "server-only";
import { createLoader } from "nuqs/server";
import { createPaginationParams } from "@/lib/url-state";

export const paginationParamsLoader = createLoader(createPaginationParams());
