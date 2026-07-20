// Mitigation-planning agent: given a notification with linked vulnerabilities
// and the resolved hospital context, propose an ordered set of mitigation plans
// (recommended first) — or none if there isn't enough information to act on.

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import { buildUserMessage } from "@/lib/agent-messages";
import prisma from "@/lib/db";
import { fetchPdfAttachments } from "../../utils";
import { gatherTriageContext } from "../triage/context";
import { type MitigationPlansResult, mitigationPlansSchema } from "./schema";

const MODEL = "claude-sonnet-4-6";
const TOOL_NAME = "record_mitigation_plans";

const SYSTEM_PROMPT = `You are a mitigation-planning agent for a hospital cybersecurity platform. Given a security notification and the resolved hospital context (linked vulnerabilities, remediations, VEX determinations, affected device groups, care areas, and clinical workflows), propose a small set of distinct mitigation plans for the hospital to choose between.

Each plan is a coherent strategy for reducing the risk from this notification, made up of concrete work orders.

RULES:
- Order the plans best-first: the FIRST plan is the one you recommend. Typically 1-3 plans.
- Plans must be genuinely different strategies (e.g. contain-now-via-network vs. patch-every-device), not slight variations. Give each a "compareLine" that says how it trades off against the others.
- Ground EVERY field in the provided notification and hospital context. Never invent device counts, CVSS/EPSS numbers, care areas, downtime figures, or remediations — use only what the context states. If the context is thin, keep the cards qualitative rather than fabricating numbers.
- Prefer plans that map to the linked remediations and affected device groups. Factor VEX determinations in: assets marked NOT_AFFECTED do not need remediating.
- cards: fill effort, downtime, residual_risk, coverage, and timeline for each plan as short at-a-glance strings.
- workOrders: each plan lists the concrete work orders that would be created if it is accepted. Title is action-oriented; shortDescription is a one-line chip; detailedDescription is the full instruction.
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
): Promise<MitigationPlansResult> {
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
    gatherTriageContext(notificationId),
  ]);

  const recordTool = tool(async () => "ok", {
    name: TOOL_NAME,
    description:
      "Record the ordered mitigation plans (first = recommended). Pass an empty plans array if there isn't enough information to propose any.",
    schema: mitigationPlansSchema,
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

  const call = res.tool_calls?.find((c) => c.name === TOOL_NAME);
  if (!call) return { plans: [] };

  const parsed = mitigationPlansSchema.safeParse(call.args);
  return parsed.success ? parsed.data : { plans: [] };
}
