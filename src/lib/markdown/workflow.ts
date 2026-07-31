import {
  serializeWorkflow,
  type workflowSerializeInclude,
} from "@/features/workflows/utils";
import type { Prisma } from "@/generated/prisma";
import { shortId } from "./shared";

type WorkflowWithRelations = Prisma.WorkflowGetPayload<{
  include: typeof workflowSerializeInclude;
}>;

export function generateWorkflowsMarkdown(
  workflows: WorkflowWithRelations[],
): string {
  if (workflows.length === 0) return "_No clinical workflows defined._";

  return workflows
    .map((wf) => {
      const serialized = serializeWorkflow(wf);
      const lines = [`### ${serialized.name} (${shortId(serialized.id)})`];
      if (serialized.description) {
        lines.push(`\n${serialized.description}`);
      }
      lines.push(
        `\n\`\`\`json\n${JSON.stringify(serialized, null, 2)}\n\`\`\``,
      );
      return lines.join("\n");
    })
    .join("\n\n");
}

// TODO: This only shows which steps are affected in a workflow, not the
// entire workflow, which may be more useful to the model for getting the
// hospital impact. If a specific step is disrupted, what are the downstream
// impacts on patient care?
export function workflowClinicalSummary(
  workflows: WorkflowWithRelations[],
  affectedAssetIds: string[],
  affectedMatchingIds: string[] = [],
): string {
  const affectedAssets = new Set(affectedAssetIds);
  const affectedMatchings = new Set(affectedMatchingIds);
  if (affectedAssets.size === 0 && affectedMatchings.size === 0) {
    return "_No affected assets or device groups to map to clinical workflows._";
  }

  const hasId = (value: unknown, set: Set<string>) =>
    Array.isArray(value) &&
    value.some((id) => typeof id === "string" && set.has(id));

  const blocks: string[] = [];
  for (const wf of workflows) {
    const serialized = serializeWorkflow(wf);
    const hitNodes = serialized.nodes.filter((node) => {
      if (node.type !== "ASSET") return false;
      // serializeWorkflow surfaces the node's linked asset / device-group-
      // matching ids into data; a node is affected if either intersects.
      const data = node.data as {
        assetIds?: unknown;
        deviceGroupMatchingIds?: unknown;
      };
      return (
        hasId(data.assetIds, affectedAssets) ||
        hasId(data.deviceGroupMatchingIds, affectedMatchings)
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
    : "_No clinical workflows include the affected assets or device groups._";
}
