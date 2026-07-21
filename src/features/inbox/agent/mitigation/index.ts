// Mitigation-planning agent: given a notification with linked vulnerabilities
// and the resolved hospital context, propose an ordered set of mitigation plans
// (recommended first) — or none if there isn't enough information to act on.

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { buildUserMessage } from "@/lib/agent-messages";
import prisma from "@/lib/db";
import { fetchPdfAttachments } from "../../utils";
import { gatherTriageContext, type LinkableIds } from "../triage/context";
import {
  buildMitigationPlansSchema,
  type MitigationPlanItem,
  type MitigationPlansResult,
} from "./schema";

const MODEL = "claude-sonnet-4-6";
const TOOL_NAME = "record_mitigation_plans";

const SYSTEM_PROMPT = `You are a mitigation-planning agent for a hospital cybersecurity platform. Given a security notification and the resolved hospital context (linked vulnerabilities, remediations, VEX determinations, affected device groups, care areas, and clinical workflows), propose a small set of distinct mitigation plans for the hospital to choose between.

Each plan is a coherent strategy for reducing the risk from this notification, made up of concrete work orders.

RULES:
- Order the plans best-first: the FIRST plan is the one you recommend. Typically 1-3 plans.
- Plans must be genuinely different strategies (e.g. contain-now-via-network vs. patch-every-device), not slight variations. Give each a "compareLine" that says how it trades off against the others.
- Ground EVERY field in the provided notification and hospital context. Never invent device counts, CVSS/EPSS numbers, care areas, downtime figures, or remediations — use only what the context states. If the context is thin, keep the cards qualitative rather than fabricating numbers, or report "Uncertain"
- Prefer plans that map to the linked remediations and affected device groups. Factor VEX determinations in: assets marked NOT_AFFECTED do not need remediating.
- cards: fill effort, downtime, residual_risk, coverage, and timeline for each plan as short at-a-glance strings.
- workOrders: each plan lists the concrete work orders that would be created if it is accepted. shortDescription is action-oriented, a title; detailedDescription is the full instruction.
- LINKING: every work order names the vulnerabilities, remediations, and device groups IT specifically addresses, using the exact ids shown inline in the hospital context (e.g. "(id: …)" on a vulnerability heading, the id on a remediation heading, "(id: …)" on a device group line). Never invent an id.
- Link narrowly. A work order that firewalls one device group must NOT list the other groups, and one that applies a single vendor patch must NOT list every remediation. Different work orders in a plan usually target different device groups. Leave a list empty rather than padding it.
- Each device group line states how many hospital assets it resolves to. A group with 0 assets is a product the hospital does not appear to own — do not attach work orders to it unless the work is explicitly about confirming inventory.
- For each device group a work order touches, give a one-line reasonWhy and set confidence: Matched only with strong evidence, otherwise NeedsReview.
- If there is not enough information to responsibly propose any plan, return an empty plans array. Do not force a plan.`;

function buildTextPrompt(input: {
  notificationType: string;
  notificationTitle: string | null;
  notificationSummary: string | null;
  markdown: string | null;
  contextMarkdown: string;
}): string {
  return `--- NOTIFICATION ---
Type: ${input.notificationType}
Title: ${input.notificationTitle ?? "(untitled)"}
Summary: ${input.notificationSummary ?? "(none)"}

--- FULL NOTIFICATION BODY ---
${input.markdown ?? "(no body)"}

--- RESOLVED HOSPITAL CONTEXT ---
${input.contextMarkdown}`;
}

export async function createMitigationPlans(
  sourceId: string,
  notificationId: string,
): Promise<MitigationPlansResult & { linkableIds: LinkableIds }> {
  const [source, notification, pdfAttachments, context] = await Promise.all([
    prisma.notificationSource.findUnique({
      where: { id: sourceId },
      select: { markdown: true },
    }),
    prisma.notification.findUnique({
      where: { id: notificationId },
      select: { type: true, title: true, summary: true },
    }),
    fetchPdfAttachments(sourceId),
    gatherTriageContext(notificationId, { includeIds: true }),
  ]);

  const { linkableIds } = context;
  const schema = buildMitigationPlansSchema(linkableIds);

  const recordTool = tool(async () => "ok", {
    name: TOOL_NAME,
    description:
      "Record the ordered mitigation plans (first = recommended). Pass an empty plans array if there isn't enough information to propose any.",
    schema,
  });

  // Extended thinking requires tool_choice "auto" (no forcing), so we bind the
  // single tool and read the call args instead of using withStructuredOutput.
  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 8000,
    thinking: { type: "enabled", budget_tokens: 4000 },
  }).bindTools([recordTool]);

  const textPrompt = buildTextPrompt({
    notificationType: notification?.type ?? "Other",
    notificationTitle: notification?.title ?? null,
    notificationSummary: notification?.summary ?? null,
    markdown: source?.markdown ?? null,
    contextMarkdown: context.markdown,
  });

  const res = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    buildUserMessage(textPrompt, pdfAttachments),
  ]);

  // Fail loud and retry if model has invalid output
  const call = res.tool_calls?.find((c) => c.name === TOOL_NAME);
  if (!call) {
    throw new Error(
      `Mitigation agent never called ${TOOL_NAME} for notification ${notificationId}`,
    );
  }

  const parsed = schema.safeParse(call.args);
  if (!parsed.success) {
    throw new Error(
      `Mitigation agent returned invalid ${TOOL_NAME} args for notification ${notificationId}: ${z.prettifyError(parsed.error)}`,
    );
  }

  return {
    plans: parsed.data.plans as MitigationPlanItem[],
    linkableIds,
  };
}
