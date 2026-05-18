import type { Edge, Node } from "@xyflow/react";

interface NodeWithName extends Node {
  data: Record<string, unknown> & { name?: string; label?: string };
}

/**
 * Converts workflow nodes and edges to Mermaid flowchart JSON
 * @param nodes Array of workflow nodes (with optional name in data)
 * @param edges Array of workflow edges
 * @returns Mermaid flowchart JSON string
 */
export function workflowToMermaidJSON(
  nodes: NodeWithName[],
  edges: Edge[],
): string {
  // Mermaid flowchart: flowchart TD; A --> B;
  const nodeLabels: Record<string, string> = {};
  nodes.forEach((node) => {
    // Use node name from data, fallback to type, then id
    const name = node.data?.label || node.type || node.id;
    nodeLabels[node.id] = name;
  });
  const lines: string[] = ["flowchart TD"];
  edges.forEach((edge) => {
    const from = nodeLabels[edge.source] || edge.source;
    const to = nodeLabels[edge.target] || edge.target;
    lines.push(`    ${edge.source}[${from}] --> ${edge.target}[${to}]`);
  });

  return lines.join("\n");
}
