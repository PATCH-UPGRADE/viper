import { z } from "zod";
import type { AssetWithIssueRelations } from "@/features/assets/types";
// TODO: VW-430 I don't think this file should import anything from fleet
// components/types to render work order tickets in chat should call
// platform-specific methods
import {
  FLEET_OPERATIONAL_STATUSES,
  FLEET_PATIENT_DANGERS,
  FLEET_SUPPORT_TYPES,
} from "@/features/integrations/platforms/teamplay-fleet/work-orders/constants";
import type { VulnerabilityWithRelations } from "@/features/vulnerabilities/types";
import { TicketCategory } from "@/generated/prisma";

export interface UseChatAgentConfig {
  agent?: "chat" | "giveRecommendations";
  assetData?: AssetWithIssueRelations;
  vulnerabilityData?: VulnerabilityWithRelations;
}

// ─── Fleet work-order proposal ───────────────────────────────────────────────

/**
 * What `propose_fleet_work_order` returns and the chat card renders. It is the
 * tool's OUTPUT, not its input: the assets here have been resolved server-side
 * against the Fleet-managed set, so a card can only ever exist for a proposal
 * that passed the Siemens-managed check. Nothing has been created on Fleet at
 * this point — that happens when the user accepts.
 */
export const fleetProposalAssetSchema = z.object({
  assetId: z.string(),
  hostname: z.string().nullable(),
  equipmentKey: z.string(),
});

// TODO: VW-430, platform-specific code needs to live inside the src/features/integrations/platform/teamplay-fleet directory
export const fleetWorkOrderProposalSchema = z.object({
  type: z.literal("fleet_work_order_proposal"),
  assets: z.array(fleetProposalAssetSchema).min(1),
  summary: z.string(),
  description: z.string(),
  category: z.enum(TicketCategory),
  // Model-set operational flags, surfaced on the approval card. Defaulted so a
  // proposal that omits one still parses and renders as a card, rather than
  // falling back to the raw-JSON accordion.
  supportType: z.enum(FLEET_SUPPORT_TYPES).default("technical"),
  operationalStatus: z
    .enum(FLEET_OPERATIONAL_STATUSES)
    .default("partially_operational"),
  dangerForPatient: z.enum(FLEET_PATIENT_DANGERS).default("unknown"),
  overtimeAuthorized: z.boolean().default(false),
  scheduledAt: z.string().nullable(),
  rationale: z.string().nullable(),
});

export type FleetWorkOrderProposal = z.infer<
  typeof fleetWorkOrderProposalSchema
>;

/** Parse a tool part's output into a proposal, or null if it isn't one. */
export function parseFleetProposal(
  output: unknown,
): FleetWorkOrderProposal | null {
  if (output == null) return null;
  // The tool returns a JSON string, but the stream bridge parses tool output
  // into an object before it reaches the UI (normalizeToolOutput), so `output`
  // is usually an object here — accept both. A rejection string ("REJECTED: …")
  // fails JSON.parse and the schema, so it correctly yields null (no card).
  let candidate: unknown = output;
  if (typeof output === "string") {
    try {
      candidate = JSON.parse(output);
    } catch {
      return null; // rejection strings and partial streams land here
    }
  }
  const parsed = fleetWorkOrderProposalSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export const fetchThreadsSchema = z.object({
  userId: z.string().optional(),
  channelKey: z.string().optional(),
  limit: z.number().int().min(1).max(100),
  cursorTimestamp: z.string().optional(),
  cursorId: z.string().optional(),
  offset: z.number().int().min(0).optional(),
  /** Only threads that have a report (the /reports list), newest-touched first. */
  withReport: z.boolean().optional(),
});

// Scalar columns for the thread list — deliberately excludes the `report` TEXT
// blob, which the list never shows.
export const chatThreadListSelect = {
  id: true,
  userId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { messages: true } },
} as const;

export const chatThreadSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  _count: z.object({
    messages: z.number(),
  }),
});

export const fetchThreadsResponseSchema = z.object({
  threads: z.array(chatThreadSchema),
  hasMore: z.boolean(),
  total: z.number(),
});
