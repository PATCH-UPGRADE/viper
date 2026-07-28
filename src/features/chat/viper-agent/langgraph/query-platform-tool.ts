import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createAgentCaller } from "@/trpc/agent-caller";

/**
 * Read-only tRPC procedures the agent may call on demand. Being a fixed enum of
 * query procedures, mutations are not representable — the agent cannot write.
 * Keep PLATFORM_CATALOG (below) in sync with this list.
 */
export const PLATFORM_QUERY_PROCEDURES = [
  "assets.getMany",
  "assets.getOne",
  "vulnerabilities.getMany",
  "vulnerabilities.getOne",
  "remediations.getMany",
  "remediations.getOne",
  "deviceGroups.getMany",
  "deviceGroups.getOne",
] as const;

/** Condensed, prompt-injectable catalog of the allowlisted read procedures. */
// TODO: Model needs access to vulnerabilities.getManyByDeviceGroup (same with remediations.getMany...)
export const PLATFORM_CATALOG = `Available read-only procedures for query_platform_data:
- assets.getMany — list/search hospital device assets. input: { search?, page?, pageSize? }
- assets.getOne — one asset by id. input: { id }
- vulnerabilities.getMany — list/search vulnerabilities (CVEs). input: { search?, page?, pageSize? }
- vulnerabilities.getOne — one vulnerability by id. input: { id }
- remediations.getMany — list/search remediations. input: { search?, page?, pageSize? }
- remediations.getOne — one remediation by id. input: { id }
- deviceGroups.getMany — list/search device groups (make/model classes). input: { search?, page?, pageSize? }
- deviceGroups.getOne — one device group by id. input: { id }`;

/**
 * Look up platform data on demand via the in-process authenticated tRPC caller.
 */
export function makeQueryPlatformDataTool(userId: string) {
  return tool(
    async ({ procedure, input }) => {
      try {
        const caller = createAgentCaller(userId);
        const fn = procedure
          .split(".")
          // biome-ignore lint/suspicious/noExplicitAny: navigating the caller tree by dot-path
          .reduce<any>((obj, key) => obj?.[key], caller);
        if (typeof fn !== "function") {
          return `Unknown procedure: ${procedure}`;
        }
        const result = await fn(input ?? {});
        return JSON.stringify(result, null, 2);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error calling ${procedure}: ${message}`;
      }
    },
    {
      name: "query_platform_data",
      description: `Read-only lookup of Viper platform data (assets, vulnerabilities, remediations, device groups) on demand. Never invent data (ids, CVSS scores, versions, hostnames); if you need a value, look it up here.

${PLATFORM_CATALOG}`,
      schema: z.object({
        procedure: z
          .enum(PLATFORM_QUERY_PROCEDURES)
          .describe(
            "Which read-only procedure to call (see the catalog in the description).",
          ),
        input: z
          .record(z.string(), z.any())
          .optional()
          .describe(
            "Procedure input. getOne: { id }. getMany: { search?, page?, pageSize? } — all optional; omit to get the first page of everything.",
          ),
      }),
    },
  );
}
