/**
 * `read_memories` is NOT a model tool here — memories are preloaded
 * deterministically by the graph's loadMemories node
 *
 * Tools are built per-request via a factory so they close over the userId
 * instead of threading it through LangGraph config.
 */
import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { FleetWorkOrderProposal } from "@/features/chat/types";
import {
  FLEET_OPERATIONAL_STATUSES,
  FLEET_PATIENT_DANGERS,
  FLEET_SUPPORT_TYPES,
} from "@/features/integrations/teamplay-fleet/constants";
import {
  listFleetManagedAssets,
  resolveFleetAssets,
  UnmanagedAssetsError,
} from "@/features/integrations/teamplay-fleet/tracking";
import { TicketCategory } from "@/generated/prisma";
import { inngest } from "@/inngest/client";
import { TOOL_REJECTED_PREFIX } from "./build-graph";

/** ```viper-ask-user ...``` block the chat UI parses to render question chips. */
const askUserQuestions = tool(
  async ({ questions }) => {
    return `\`\`\`viper-ask-user\n${JSON.stringify({ questions }, null, 2)}\n\`\`\``;
  },
  {
    name: "ask_user_questions",
    description:
      "Ask the user 1–4 clarifying questions in a single turn. Use this when missing information would meaningfully change the recommendation. Prefer batching related questions into one call rather than asking back-to-back. Each question includes suggested quick-reply answers; the user may always free-type instead.",
    schema: z.object({
      questions: z
        .array(
          z.object({
            question: z
              .string()
              .describe("The question, phrased for the user's role."),
            reason: z
              .string()
              .describe(
                "Why the answer is needed — what recommendation it unblocks.",
              ),
            suggested_answers: z
              .array(z.string())
              .min(2)
              .max(6)
              .describe(
                "2–6 short suggested answers rendered as quick-reply chips. The user may always free-type a different answer.",
              ),
          }),
        )
        .min(1)
        .max(4)
        .describe(
          "1–4 questions to ask. Batch related clarifications into one call to avoid multiple turns.",
        ),
    }),
  },
);

/** Schedule memory create/update/delete via the manageMemoriesFn Inngest function. */
function makeManageMemoriesTool(userId: string) {
  return tool(
    async ({ creations, updates, deletions }) => {
      const operations = [
        ...(creations ?? []).map((content) => ({ content })),
        ...(updates ?? []).map(({ id, statement }) => ({
          id,
          content: statement,
        })),
        ...(deletions ?? []).map(({ id }) => ({ id, delete: true as const })),
      ];

      if (operations.length === 0) return "No operations to perform.";

      // Publish the event; the manageMemoriesFn Inngest function persists the
      // memory operations.
      await inngest.send({
        name: "app/memories.manage",
        data: { userId, operations },
      });

      return `Scheduled ${operations.length} memory operation(s).`;
    },
    {
      name: "manage_memories",
      description: `Create, update, and/or delete memories in a single atomic operation.
Use this to persist meaningful facts about the user (role, hospital context, recurring concerns, technical focus areas).
Avoid duplicates — use update if a similar memory already exists.
Do not save one-time queries or transient requests.`,
      schema: z.object({
        creations: z
          .array(z.string())
          .optional()
          .describe("New statements to save as memories."),
        updates: z
          .array(
            z.object({
              id: z.string().describe("ID of the memory to update."),
              statement: z
                .string()
                .describe("The corrected information to save."),
            }),
          )
          .optional()
          .describe("Memories to update."),
        deletions: z
          .array(
            z.object({
              id: z.string().describe("ID of the memory to delete."),
            }),
          )
          .optional()
          .describe("Memories to delete."),
      }),
    },
  );
}

// ─── Siemens Healthineers Fleet work orders ──────────────────────────────────

/**
 * The inventory the agent is allowed to file Fleet work orders against. Needed
 * as a tool (not just context) because the chat graph preloads memories only —
 * it has no asset context at all — and because it hands the model the FULL
 * asset ids that propose_fleet_work_order expects.
 */
const listFleetManagedAssetsTool = tool(
  async () => {
    const assets = await listFleetManagedAssets();
    if (assets.length === 0) {
      return "No assets in this hospital are managed by Siemens Healthineers, so no Fleet work order can be opened.";
    }
    return JSON.stringify(assets, null, 2);
  },
  {
    name: "list_fleet_managed_assets",
    description:
      "List the assets managed (serviced) by Siemens Healthineers, with the full asset id needed by propose_fleet_work_order. These are the ONLY assets a teamplay Fleet work order can be opened for. Call this before proposing a work order to confirm the asset qualifies.",
    schema: z.object({}),
  },
);

/**
 * Proposes — never creates. The result is rendered as an approval card; the work
 * order is only filed on Fleet when the user clicks Accept (which calls
 * tracking.createFleetWorkOrder, where the Siemens-managed check runs again).
 */
const proposeFleetWorkOrder = tool(
  async ({
    assetIds,
    summary,
    description,
    category,
    supportType,
    operationalStatus,
    dangerForPatient,
    overtimeAuthorized,
    scheduledAt,
    rationale,
  }) => {
    try {
      const assets = await resolveFleetAssets(assetIds);
      if (dangerForPatient === "yes") {
        // Fleet won't accept a patient-safety issue online — it must be phoned
        // in. Reject (not halt) so the model explains that to the user instead
        // of leaving a work-order card that can't be accepted.
        return `${TOOL_REJECTED_PREFIX} This is a patient-safety issue (dangerForPatient=yes). Siemens Healthineers requires these to be reported by phone, not filed as an online work order — tell the user to call Siemens rather than proposing a work order.`;
      }
      const proposal: FleetWorkOrderProposal = {
        type: "fleet_work_order_proposal",
        assets: assets.map((a) => ({
          assetId: a.assetId,
          hostname: a.hostname,
          equipmentKey: a.equipmentKey,
        })),
        summary,
        description,
        category,
        supportType,
        operationalStatus,
        dangerForPatient,
        overtimeAuthorized,
        scheduledAt: scheduledAt ?? null,
        rationale: rationale ?? null,
      };
      return JSON.stringify(proposal);
    } catch (error) {
      if (error instanceof UnmanagedAssetsError) {
        // Prefixed so the graph does NOT end the turn (see build-graph) — the
        // model needs to explain the refusal instead of leaving a dead card.
        return `${TOOL_REJECTED_PREFIX} ${error.message}`;
      }
      throw error;
    }
  },
  {
    name: "propose_fleet_work_order",
    description: `Propose a work order on the Siemens Healthineers teamplay Fleet platform for one or more Siemens-managed assets.
This does NOT create anything: it presents a recommendation the user must explicitly accept. Never tell the user the work order has been created or scheduled — say you have proposed one for their approval.
Only assets managed by Siemens Healthineers are eligible (use list_fleet_managed_assets). Proposing any other asset is refused.
Use this when the remediation is service work Siemens would perform — a firmware/software update, or maintenance on one of their devices.`,
    schema: z.object({
      assetIds: z
        .array(z.string())
        .min(1)
        .describe(
          "Full VIPER asset ids (from list_fleet_managed_assets or the provided context) the work order covers. One Fleet work order is filed per asset.",
        ),
      summary: z
        .string()
        .describe(
          "Short title for the work order, e.g. 'Firmware update: MRI-01'.",
        ),
      description: z
        .string()
        .describe(
          "What the Siemens engineer needs to do and why, including the vulnerability or maintenance driver. Do not invent CVSS scores or version numbers.",
        ),
      category: z
        .enum(TicketCategory)
        .describe(
          "FIRMWARE_UPDATE for software/firmware service, MAINTENANCE for preventive or corrective maintenance.",
        ),
      supportType: z
        .enum(FLEET_SUPPORT_TYPES)
        .default("technical")
        .describe(
          "Which Siemens support queue: 'technical' for device/hardware/firmware service (the usual case), 'application' for the imaging application/software layer.",
        ),
      operationalStatus: z
        .enum(FLEET_OPERATIONAL_STATUSES)
        .default("partially_operational")
        .describe(
          "The device's CURRENT operational status, sent to Siemens as the ticket severity. Fleet has only two: 'partially_operational' for a device that is working or degraded but still in use (the usual case for a preventive/security update), 'not_operational' only when the device is actually down. Do NOT use 'not_operational' for a working device.",
        ),
      dangerForPatient: z
        .enum(FLEET_PATIENT_DANGERS)
        .default("unknown")
        .describe(
          "Patient-safety risk of the underlying issue: 'yes' if the device could malfunction during care, 'no' when there is clearly no direct risk, 'unknown' when you can't determine it. NOTE: a 'yes' cannot be filed online — Siemens requires a phone call — so the user will be told to call rather than accept. Only use 'yes' for a genuine direct risk.",
        ),
      overtimeAuthorized: z
        .boolean()
        .default(false)
        .describe(
          "True if the hospital authorizes after-hours (overtime) service at additional cost. Default false; only set true when the urgency justifies it.",
        ),
      scheduledAt: z
        .string()
        .nullish()
        .describe(
          "Proposed service window start as an ISO-8601 datetime. Base it on device utilization windows; omit if unknown.",
        ),
      rationale: z
        .string()
        .nullish()
        .describe(
          "One or two sentences shown to the user on the approval card explaining why this work order is recommended now.",
        ),
    }),
  },
);

/** All model-facing tools for the Chat agent, bound to a user. */
export function buildChatTools(userId: string) {
  return [
    makeManageMemoriesTool(userId),
    askUserQuestions,
    listFleetManagedAssetsTool,
    proposeFleetWorkOrder,
  ];
}
