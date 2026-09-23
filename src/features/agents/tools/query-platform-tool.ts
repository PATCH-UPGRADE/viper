import "server-only";
import { tool } from "@langchain/core/tools";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAgentCaller } from "@/trpc/agent-caller";

/**
 * Read-only tRPC procedures the agent may call on demand. Being a fixed enum of
 * query procedures, mutations are not representable — the agent cannot write.
 * Keep PLATFORM_CATALOG (below) in sync with this list.
 */
// TODO: VW-409 -- Considering a progressive disclosure API endpoint to show
// which issues affect which assets
export const PLATFORM_QUERY_PROCEDURES = [
  "assets.getMany",
  "assets.getOne",
  "assets.getManyByDeviceGroup",
  "assets.getManyByWorkflow",
  "assets.getUtilization",
  "vulnerabilities.getMany",
  "vulnerabilities.getOne",
  "vulnerabilities.getManyByDeviceGroup", // TODO: VW-409
  "remediations.getMany",
  "remediations.getOne",
  "deviceGroups.getMany",
  "deviceGroups.getOne",
  "workflows.getManyByAsset",
  "workflows.getManyForLlm",
  "notifications.getMany",
  "notifications.getOne",
  "tracking.getManyForLlm",
  "tracking.getOneForLlm",
] as const;

/** Shared with the debrief writer, which never sees the catalog. */
export const WORK_ORDER_STATUS_GUIDE = `Report a work order's status exactly: only
IN_PROGRESS means work has started, TO_DO means it is open but not started, and
REQUIRES_APPROVAL means it waits for sign-off. A work order with "relation":
"sharedVulnerability" addresses a vulnerability that the item also names, so call it
related work, not work filed for that item. "direct" means it was filed for that item.`;

/** Condensed, prompt-injectable catalog of the allowlisted read procedures. */
export const PLATFORM_CATALOG = `Available read-only procedures for query_platform_data:
- assets.getMany — list/search hospital device assets. input: { search?, page?, pageSize? }
- assets.getOne — one asset by id. input: { id }
  Both carry "managedBy": who services the asset, as a vendor or a department, with
  their responsibilities. An entry whose "workOrderIntegration" is set names the
  platform their work orders are filed on — use list_work_order_targets to file one.
  An entry with a "contract" is serviced under that agreement: cite its title when you
  say who owns the work, and do not schedule past its "effectiveTo" date without
  saying that the contract ends first. A null contract still means a real manager.
- assets.getManyByDeviceGroup — assets in a device group. input: { deviceGroupId, search?, page?, pageSize? }
- assets.getManyByWorkflow — assets used in a clinical workflow. input: { id } (workflow id)
- assets.getUtilization — one asset's utilization schedule, as a readable summary. input: { id }
- vulnerabilities.getMany — list/search vulnerabilities (CVEs). input: { search?, page?, pageSize? }
- vulnerabilities.getOne — one vulnerability by id. input: { id }
- vulnerabilities.getManyByDeviceGroup — vulnerabilities affecting a device group. input: { deviceGroupId, search?, page?, pageSize? }
- remediations.getMany — list/search remediations. input: { search?, page?, pageSize? }
- remediations.getOne — one remediation by id. input: { id }
- deviceGroups.getMany — list/search device groups (make/model classes). input: { search?, page?, pageSize? }
- deviceGroups.getOne — one device group by id. input: { id }
- workflows.getManyByAsset — clinical workflows that use an asset. input: { id } (asset id)
- workflows.getManyForLlm — list/search all clinical workflows. input: { search?, page?, pageSize? }
- notifications.getMany — list/search inbox notifications. input: { search?, page?, pageSize?, priority?, type? } — priority and type are optional arrays; omit them for everything. priority values: Critical, High, Monitor, Defer, Unsorted. type values: Advisory, Recall, UpdateAvailable, Other. pageSize is capped at 10 here and a larger request is clamped, so read totalCount and step through with page.
- notifications.getOne — one notification by id, with the affected-asset counts per matching rule and the ids of the vulnerabilities it references. input: { id }
- tracking.getManyForLlm — list work orders (the hospital's tickets for work being done). input: { notificationId?, vulnerabilityId?, assetId?, departmentId?, status?, search?, page?, pageSize? } — status is an optional array of TO_DO, IN_PROGRESS, REQUIRES_APPROVAL, DONE; omit it to get every work order that is not DONE. pageSize is capped at 20. Each row lists at most 5 vulnerabilities (_count.vulnerabilities is the total) and up to 10 sub-tickets that are not DONE (_count.children counts every sub-ticket).
- tracking.getOneForLlm — one work order by id, with its description, sub-tickets, up to 20 assets (each with its own status and external ticket ids; _count.assets is the total), remediations, external ticket ids, and its 5 newest comments, newest first. input: { id }

'Workflows' represent how devices are used in clinical contexts/for patient care.

'Notifications' are the hospital's inbox: vendor advisories, recalls, and update
announcements that arrive from vendors and feeds. Each carries a triaged priority and
the matching rules it was matched to.

A notification's "deviceGroupsMatchings" and "affectedAssets" entries are matching RULES
(manufacturer/product/version), not device groups. They give asset COUNTS per triage
bucket, not asset records, and their ids are NOT device group ids — never send one as a
deviceGroupId, because that returns an empty page instead of an error and reads as "no
assets affected". To get the assets themselves, find the device group with
deviceGroups.getMany, and search on the matching's manufacturer/product/version names.
Then follow that device group's "_links.assets". A notification's "vulnerabilities"
array holds vulnerabilityId values; send one to vulnerabilities.getOne for the CVE.

'Work orders' show whether anyone is already working an item. Notifications, assets,
and vulnerabilities carry "_links.workOrders"; follow it before you say whether an item
is being worked. An empty result means no open work order was found — say that, and
never claim a work order you did not retrieve. Rows returned for a notificationId carry
a "relation".
${WORK_ORDER_STATUS_GUIDE}

Assets, vulnerabilities, and remediations each include a "notes" array of resolved,
entity-specific notes ({ id, text }) — device/vuln/remediation caveats a human recorded
(e.g. "this asset moved its password store to SSO"). Read them; they are authoritative and
may change your recommendation. (Hospital-wide persistent notes are provided separately.)

Some returned objects include a "_links" map — each entry is a follow-up call you can make.
To follow one, call query_platform_data again with that entry's "procedure" and "input"
verbatim. Use only ids that appear in retrieved data (e.g. an asset's deviceGroup.id); never
invent them. When a patch/service window matters, follow the asset's "_links.utilization"
to get a readable schedule summary.`;

const workOrdersLink = (input: Record<string, string>) => ({
  procedure: "tracking.getManyForLlm",
  input,
});

/**
 * see src/lib/prisma-client-extensions.ts
 * Device Groups embed HATEOAS-style links to other endpoints
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

/**
 * Merge navigation hints into an object's `_links` map.
 *
 * Always merge, never assign. A single object can match more than one shape
 * rule below, and a plain assignment silently drops the links an earlier rule
 * added. The "does not clobber links added by another transform" test pins
 * this; keeping the merge in one place stops a new entity from regressing it.
 */
function addLinks(
  obj: Record<string, unknown>,
  links: Record<string, unknown>,
): void {
  // Narrow before spreading: the walker types values as unknown, and an object
  // reached here may already carry links from an earlier shape rule.
  const existing = (obj._links ?? {}) as Record<string, unknown>;
  obj._links = { ...existing, ...links };
}

// biome-ignore lint/suspicious/noExplicitAny: walking arbitrary tRPC result JSON
function linkifyDeviceGroup(dg: Record<string, any>): void {
  const id = dg.id;
  for (const key of DEVICE_GROUP_URL_KEYS) delete dg[key];
  if (typeof id !== "string") return;
  addLinks(dg, {
    assets: {
      procedure: "assets.getManyByDeviceGroup",
      input: { deviceGroupId: id },
    },
    vulnerabilities: {
      procedure: "vulnerabilities.getManyByDeviceGroup",
      input: { deviceGroupId: id },
    },
  });
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
  addLinks(asset, {
    workflows: {
      procedure: "workflows.getManyByAsset",
      input: { id },
    },
    workOrders: workOrdersLink({ assetId: id }),
    ...(hasUtilization
      ? {
          utilization: {
            procedure: "assets.getUtilization",
            input: { id },
          },
        }
      : {}),
  });
}

/**
 * Add a hint for model to get assets in a workflow by inserting a HATEOAS-style
 * `_links` object
 */
// biome-ignore lint/suspicious/noExplicitAny: walking arbitrary tRPC result JSON
function linkifyWorkflow(workflow: Record<string, any>): void {
  const id = workflow.id;
  if (typeof id !== "string") return;
  addLinks(workflow, {
    assets: {
      procedure: "assets.getManyByWorkflow",
      input: { id },
    },
  });
}

/**
 * Manufacturer, Product, Version, and Vendor are canonical reference records.
 * Their audit columns and internal flags never change an answer, and the same
 * record repeats once per row that references it. One vendor advisory carries
 * 18 device group matchings, so the identical manufacturer arrives 18 times.
 *
 * Keep the id and the names. The catalog tells the model to find a device group
 * by searching these names, so they are load-bearing.
 *
 * Every key below is a scalar or a string array, so the order against the child
 * walk does not matter.
 */
const CANONICAL_NOISE_KEYS = [
  "hasCpe",
  "nameMappings",
  "versScheme",
  "createdAt",
  "updatedAt",
] as const;

// biome-ignore lint/suspicious/noExplicitAny: walking arbitrary tRPC result JSON
function trimCanonicalRecord(record: Record<string, any>): void {
  for (const key of CANONICAL_NOISE_KEYS) delete record[key];
}

/**
 * A source record carries `raw`: the entire inbound payload, e.g. a whole
 * Resend email event. It is worth tens of KB of context per row, and the model
 * never needs it — `markdown` and the parent's own summary already carry the
 * content.
 *
 * Matched on the row's own shape, not its parent: Notification and
 * WorkOrderTicket both hold `sources`, so the parent is not a reliable signal.
 *
 * Stripped before the child walk, so the payload is never recursed into.
 */
function stripSourcePayload(source: Record<string, unknown>): void {
  delete source.raw;
}

/**
 * Notifications are the hospital's inbox items. getMany returns list rows without
 * the affected-asset breakdown, so point the model at the detail call.
 */
// biome-ignore lint/suspicious/noExplicitAny: walking arbitrary tRPC result JSON
function linkifyNotification(notification: Record<string, any>): void {
  const id = notification.id;
  if (typeof id !== "string") return;
  addLinks(notification, {
    detail: { procedure: "notifications.getOne", input: { id } },
    workOrders: workOrdersLink({ notificationId: id }),
  });
}

type PlatformCall = { procedure: string; input: Record<string, unknown> };

const sameCall = (link: unknown, call: PlatformCall): boolean => {
  if (typeof link !== "object" || link === null) return false;
  const { procedure, input } = link as Partial<PlatformCall>;
  if (procedure !== call.procedure || !input) return false;
  const keys = Object.keys(input);
  return (
    keys.length === Object.keys(call.input).length &&
    keys.every((k) => input[k] === call.input[k])
  );
};

/**
 * Only the top-level record can point back at the call that produced it (a
 * detail result's "detail" link), so the check runs there and not in the walk.
 */
function dropSelfLinks(value: unknown, call: PlatformCall): void {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return;
  const obj = value as Record<string, unknown>;
  const links = obj._links as Record<string, unknown> | undefined;
  if (!links) return;
  for (const [name, link] of Object.entries(links))
    if (sameCall(link, call)) delete links[name];
  if (Object.keys(links).length === 0) delete obj._links;
}

/**
 * Deep-walk a tRPC result and turn every device group's HATEOAS URLs into tRPC
 * "_links" navigation hints. Also drops payloads too expensive to put in context.
 *
 * Entities are matched by shape, not by the procedure that produced them, so a
 * nested entity is linkified too (e.g. the device group inside an asset result).
 *
 * Exported for tests; the tool itself is the only production caller.
 */
export function addNavigationLinks(
  value: unknown,
  call?: PlatformCall,
): unknown {
  linkEntities(value);
  if (call) dropSelfLinks(value, call);
  return value;
}

function linkEntities(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) linkEntities(item);
    return;
  }
  if (value === null || typeof value !== "object") return;
  // biome-ignore lint/suspicious/noExplicitAny: walking arbitrary tRPC result JSON
  const obj = value as Record<string, any>;
  if ("raw" in obj && "channel" in obj) stripSourcePayload(obj);
  for (const key of Object.keys(obj)) linkEntities(obj[key]);
  if ("canonicalName" in obj && "canonicalDisplayName" in obj)
    trimCanonicalRecord(obj);
  if ("assetsUrl" in obj || "vulnerabilitiesUrl" in obj)
    linkifyDeviceGroup(obj);
  if ("utilization" in obj) linkifyAsset(obj);
  // hospitalImpact exists only on Notification
  if ("hospitalImpact" in obj) linkifyNotification(obj);

  const id = typeof obj.id === "string" ? obj.id : undefined;
  if (!id) return;
  // Full vulnerability records only. The { id, cveId } stubs nested in work
  // orders and notifications have no inKEV.
  if ("cveId" in obj && "inKEV" in obj)
    addLinks(obj, { workOrders: workOrdersLink({ vulnerabilityId: id }) });
  // Only WorkOrderTicket has all three.
  if ("summary" in obj && "category" in obj && "status" in obj)
    addLinks(obj, {
      detail: { procedure: "tracking.getOneForLlm", input: { id } },
    });
  if (Array.isArray(obj.nodes) && !("type" in obj)) linkifyWorkflow(obj);
}

type PlatformProcedure = (typeof PLATFORM_QUERY_PROCEDURES)[number];

/**
 * Hard page-size limits for procedures whose cost grows faster than their row
 * count. `paginationInputSchema` accepts up to 100, and prose in the catalog is
 * advisory — the model can ignore it and often will.
 *
 * notifications.getMany runs one deviceGroup.findMany per matching per row, with
 * no batching. A vendor advisory carries ~18 matchings, so a page of 100 is
 * ~1800 concurrent queries against a Prisma pool of roughly 17. The overflow
 * throws P2024, which reaches the model as "an unexpected error occurred", and
 * the pool is starved for the live UI while it happens.
 *
 * Capped here rather than in `paginationInputSchema`, because the routers are
 * shared with the UI and this limit is about the agent caller only.
 */
const PAGE_SIZE_CAPS: Partial<Record<PlatformProcedure, number>> = {
  "notifications.getMany": 10,
  "tracking.getManyForLlm": 20,
};

/**
 * Clamp an over-large page request. The response still carries `totalCount` and
 * `hasNextPage`, so the model can see that more rows exist and page for them.
 *
 * Exported for tests.
 */
export function capPageSize(
  procedure: PlatformProcedure,
  input: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const cap = PAGE_SIZE_CAPS[procedure];
  if (cap === undefined) return input;
  const requested = input?.pageSize;
  if (typeof requested !== "number" || requested <= cap) return input;
  return { ...input, pageSize: cap };
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
        const callInput = capPageSize(procedure, input) ?? {};
        const result = await fn(callInput);
        return JSON.stringify(
          addNavigationLinks(result, { procedure, input: callInput }),
        );
      } catch (error) {
        const message =
          error instanceof TRPCError
            ? error.message
            : "an unexpected error occurred";
        return `Error calling ${procedure}: ${message}`;
      }
    },
    {
      name: "query_platform_data",
      description: `Read-only lookup of Viper platform data (assets, vulnerabilities, remediations, device groups, clinical workflows, inbox notifications, work orders) on demand. Never invent data (ids, CVSS scores, versions, hostnames); if you need a value, look it up here. Returned objects may carry a "_links" map of follow-up calls — call this tool again with a link's procedure and input to navigate (e.g. from an asset's device group to all its assets or vulnerabilities).

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
