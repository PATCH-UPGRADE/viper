// Workflow → markdown renderers.
//
// - generateWorkflowsMarkdown: full dump (name + description + serialized node/
//   connection graph as JSON). Verbose; used by the recommendations-context
//   tool, which runs on Opus.
// - workflowClinicalSummary: compact, asset-filtered summary. Used by the inbox
//   triage agent (Haiku), which only needs to know which clinical pathways the
//   affected devices sit in — not the full graph.

import { serializeWorkflow } from "@/features/workflows/utils";
import type { Prisma } from "@/generated/prisma";
import { shortId } from "./shared";

type WorkflowWithRelations = Prisma.WorkflowGetPayload<{
  include: { nodes: true; connections: true };
}>;

export function generateWorkflowsMarkdown(
  workflows: WorkflowWithRelations[],
): string {
  if (workflows.length === 0) return "_No clinical workflows defined._";

  return workflows
    .map((wf) => {
      const serialized = serializeWorkflow(wf);
      const { edges: _edges, ...withoutEdges } = serialized;
      const lines = [`### ${serialized.name} (${shortId(serialized.id)})`];
      if (serialized.description) {
        lines.push(`\n${serialized.description}`);
      }
      lines.push(
        `\n\`\`\`json\n${JSON.stringify(withoutEdges, null, 2)}\n\`\`\``,
      );
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Compact summary of the clinical workflows that include one or more of the
 * given assets. For each matching workflow: its name, description, and the
 * asset-node steps that reference an affected asset.
 *
 * A workflow "includes" an asset when one of its ASSET nodes lists that asset
 * id in `node.data.assetIds` (see `src/features/asset-nodes`).
 */
export function workflowClinicalSummary(
  workflows: WorkflowWithRelations[],
  affectedAssetIds: string[],
): string {
  const affected = new Set(affectedAssetIds);
  if (affected.size === 0) {
    return "_No affected assets to map to clinical workflows._";
  }

  const blocks: string[] = [];
  for (const wf of workflows) {
    const serialized = serializeWorkflow(wf);
    const hitNodes = serialized.nodes.filter((node) => {
      if (node.type !== "ASSET") return false;
      const ids = (node.data as { assetIds?: unknown }).assetIds;
      return (
        Array.isArray(ids) &&
        ids.some((id) => typeof id === "string" && affected.has(id))
      );
    });
    if (hitNodes.length === 0) continue;

    const lines = [`### ${serialized.name} (${shortId(serialized.id)})`];
    if (serialized.description) lines.push(serialized.description);
    lines.push(
      `- **Affected steps**: ${hitNodes
        .map((n) => {
          const data = n.data as { name?: string; label?: string };
          return data.name ?? data.label ?? n.id;
        })
        .join(", ")}`,
    );
    blocks.push(lines.join("\n"));
  }

  return blocks.length > 0
    ? blocks.join("\n\n")
    : "_No clinical workflows include the affected assets._";
}
