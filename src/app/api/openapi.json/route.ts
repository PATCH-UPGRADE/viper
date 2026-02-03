import { generateOpenApiDocument } from "trpc-to-openapi";
import { getBaseUrl } from "@/lib/url-utils";
import { appRouter } from "@/trpc/routers/_app";

// This endpoint is publicly accessible (no auth required)
export async function GET() {
  const openApiDocument = generateOpenApiDocument(appRouter, {
    title: "PATCH Vulnerability Management API",
    description:
      "API for managing assets, vulnerabilities, and remediations in hospital environments",
    version: "1.0.0",
    baseUrl: `${getBaseUrl()}/api/v1`,
    docsUrl: "https://github.com/PATCH-UPGRADE",
    tags: ["Assets", "Vulnerabilities", "Remediations", "DeviceArtifacts"],
  });

  return Response.json(openApiDocument);
}
