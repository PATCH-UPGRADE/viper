import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createAgentCaller } from "@/trpc/agent-caller";

/**
 * Read-only tRPC procedures the agent may call on demand. Being a fixed enum of
 * query procedures, mutations are not representable — the agent cannot write.
 * Keep PLATFORM_CATALOG (below) in sync with this list.
 */
// TODO: VW-409 -- Considering a progressive disclosure API endpoint to show
// which issues affect which assets
//
// TODO: VW-410 -- Considering a progressive disclosure API endpoint to show
// which clinical workflows affect which assets
export const PLATFORM_QUERY_PROCEDURES = [
  "assets.getMany",
  "assets.getOne",
  "assets.getManyByDeviceGroup",
  "assets.getUtilization",
  "vulnerabilities.getMany",
  "vulnerabilities.getOne",
  "vulnerabilities.getManyByDeviceGroup", // TODO: VW-409
  "remediations.getMany",
  "remediations.getOne",
  "deviceGroups.getMany",
  "deviceGroups.getOne",
] as const;

/** Condensed, prompt-injectable catalog of the allowlisted read procedures. */
export const PLATFORM_CATALOG = `Available read-only procedures for query_platform_data:
- assets.getMany — list/search hospital device assets. input: { search?, page?, pageSize? }
- assets.getOne — one asset by id. input: { id }
- assets.getManyByDeviceGroup — assets in a device group. input: { deviceGroupId, search?, page?, pageSize? }
- assets.getUtilization — one asset's utilization schedule, as a readable summary. input: { id }
- vulnerabilities.getMany — list/search vulnerabilities (CVEs). input: { search?, page?, pageSize? }
- vulnerabilities.getOne — one vulnerability by id. input: { id }
- vulnerabilities.getManyByDeviceGroup — vulnerabilities affecting a device group. input: { deviceGroupId, search?, page?, pageSize? }
- remediations.getMany — list/search remediations. input: { search?, page?, pageSize? }
- remediations.getOne — one remediation by id. input: { id }
- deviceGroups.getMany — list/search device groups (make/model classes). input: { search?, page?, pageSize? }
- deviceGroups.getOne — one device group by id. input: { id }

Assets, vulnerabilities, and remediations each include a "notes" array of resolved,
entity-specific notes ({ id, text }) — device/vuln/remediation caveats a human recorded
(e.g. "this asset moved its password store to SSO"). Read them; they are authoritative and
may change your recommendation. (Hospital-wide persistent notes are provided separately.)

Some returned objects include a "_links" map — each entry is a follow-up call you can make.
To follow one, call query_platform_data again with that entry's "procedure" and "input"
verbatim. Use only ids that appear in retrieved data (e.g. an asset's deviceGroup.id); never
invent them. When a patch/service window matters, follow the asset's "_links.utilization"
to get a readable schedule summary.`;

/**
 * see src/lib/prisma-client-extensions.ts
 * Device Groups embed HATOAS-style links to other endpoints
 * They are HTTP hrefs the agent cannot call, so we strip them and replace
 * them with tRPC call hints.
 * Goal: Make "progressive disclosure" obvious to LLM
 */
const DEVICE_GROUP_URL_KEYS = [
  "url",
  "sbomUrl",
  "vulnerabilitiesUrl",
  "assetsUrl",
  "deviceArtifactsUrl",
] as const;

// biome-ignore lint/suspicious/noExplicitAny: walking arbitrary tRPC result JSON
function linkifyDeviceGroup(dg: Record<string, any>): void {
  const id = dg.id;
  for (const key of DEVICE_GROUP_URL_KEYS) delete dg[key];
  if (typeof id !== "string") return;
  dg._links = {
    assets: {
      procedure: "assets.getManyByDeviceGroup",
      input: { deviceGroupId: id },
    },
    vulnerabilities: {
      procedure: "vulnerabilities.getManyByDeviceGroup",
      input: { deviceGroupId: id },
    },
  };
}

/**
 * Strip an asset's raw hourly utilization blob (high token cost, low value) and,
 * only when the asset actually has utilization data, replace it with a
 * "_links.utilization" hint the model can follow on demand to get the rendered
 * schedule summary (assets.getUtilization). Assets with no data get no link.
 */
// biome-ignore lint/suspicious/noExplicitAny: walking arbitrary tRPC result JSON
function linkifyAsset(asset: Record<string, any>): void {
  const id = asset.id;
  if (typeof id !== "string") return;
  const hasUtilization = asset.utilization != null;
  delete asset.utilization;
  if (!hasUtilization) return;
  asset._links = {
    ...(asset._links ?? {}),
    utilization: {
      procedure: "assets.getUtilization",
      input: { id },
    },
  };
}

/**
 * Deep-walk a tRPC result and turn every device group's HATEOAS URLs into tRPC
 * "_links" navigation hints
 */
function addNavigationLinks(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) addNavigationLinks(item);
    return value;
  }
  if (value !== null && typeof value === "object") {
    // biome-ignore lint/suspicious/noExplicitAny: walking arbitrary tRPC result JSON
    const obj = value as Record<string, any>;
    for (const key of Object.keys(obj)) addNavigationLinks(obj[key]);
    if ("assetsUrl" in obj || "vulnerabilitiesUrl" in obj)
      linkifyDeviceGroup(obj);
    if ("utilization" in obj) linkifyAsset(obj);
    return obj;
  }
  return value;
}

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
        return JSON.stringify(addNavigationLinks(result), null, 2);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error calling ${procedure}: ${message}`;
      }
    },
    {
      name: "query_platform_data",
      description: `Read-only lookup of Viper platform data (assets, vulnerabilities, remediations, device groups) on demand. Never invent data (ids, CVSS scores, versions, hostnames); if you need a value, look it up here. Returned objects may carry a "_links" map of follow-up calls — call this tool again with a link's procedure and input to navigate (e.g. from an asset's device group to all its assets or vulnerabilities).

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
