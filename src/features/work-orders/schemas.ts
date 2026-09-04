// Client-safe: the approval card, the agent tool and the tRPC endpoint all read
// these, so nothing server-only may be added.

import { z } from "zod";
import { TicketCategory } from "@/generated/prisma";

/**
 * What `propose_work_order` accepts.
 *
 * `platformPayload` is deliberately loose. Its real shape depends on which
 * platform the model picked, and a tool's declared schema is fixed when the
 * model is bound, so it cannot vary per call. The server validates it against
 * the chosen platform's own schema instead, and hands back the errors when it
 * does not fit.
 */
export const proposeWorkOrderSchema = z.object({
  assetIds: z
    .array(z.string())
    .min(1)
    // The draft and its children are written in one interactive transaction,
    // which Postgres gives five seconds. A proposal wider than this should be
    // split, not silently rolled back at the end.
    .max(50)
    .describe(
      "Full VIPER asset ids the work order covers. One order is filed per asset on platforms that track work per device.",
    ),
  summary: z
    .string()
    .min(1)
    .describe("Short title, e.g. 'Firmware update: MRI-01'."),
  description: z
    .string()
    .default("")
    .describe(
      "What the engineer needs to do and why, including the vulnerability or maintenance driver. Do not invent CVSS scores or version numbers.",
    ),
  category: z
    .enum(TicketCategory)
    .describe(
      "FIRMWARE_UPDATE for software or firmware service, MAINTENANCE for preventive or corrective maintenance.",
    ),
  scheduledAt: z
    .string()
    .nullish()
    .describe(
      "Proposed service window start as an ISO-8601 datetime. Base it on device utilization windows; omit if unknown.",
    ),
  targetIntegrationId: z
    .string()
    .nullish()
    .describe(
      "The integration to file on, from list_work_order_targets. Omit only when that tool reported no platform manages these assets, in which case the order is tracked in VIPER alone.",
    ),
  platformPayload: z
    .record(z.string(), z.unknown())
    .default({})
    .describe(
      "The platform's own fields. Use exactly the JSON Schema list_work_order_targets returned for the chosen integration. Empty when there is no target.",
    ),
  rationale: z
    .string()
    .nullish()
    .describe(
      "One or two sentences shown to the user on the approval card, explaining why this is recommended now.",
    ),
});

/** What the tool returns and the card renders. Nothing has been filed yet. */
const workOrderProposalSchema = z.object({
  type: z.literal("work_order_proposal"),
  /** The draft ticket this proposal created. The card acts on this. */
  ticketId: z.string(),
  summary: z.string(),
  description: z.string(),
  category: z.enum(TicketCategory),
  scheduledAt: z.string().nullable(),
  rationale: z.string().nullable(),
  /** Null when no platform manages these assets and VIPER tracks it alone. */
  target: z
    .object({
      integrationId: z.string(),
      integrationName: z.string(),
      managedBy: z.string().nullable(),
    })
    .nullable(),
  assets: z.array(z.object({ id: z.string(), label: z.string() })),
  /** Rendered as plain rows, so a new platform needs no card of its own. */
  platformPayload: z.record(z.string(), z.unknown()),
});

export type WorkOrderProposal = z.infer<typeof workOrderProposalSchema>;

/** Parse a tool part's output into a proposal, or null if it is not one. */
export function parseWorkOrderProposal(
  output: unknown,
): WorkOrderProposal | null {
  if (output == null) return null;
  // The tool returns a JSON string, but the stream bridge parses tool output
  // into an object before it reaches the UI, so accept both. A rejection string
  // fails both and correctly yields null, so no card renders.
  let candidate: unknown = output;
  if (typeof output === "string") {
    try {
      candidate = JSON.parse(output);
    } catch {
      return null;
    }
  }
  const parsed = workOrderProposalSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
