import toposort from 'toposort';
import { Connection, Node } from '@/generated/prisma';

export const topologicalSort = (
  nodes: Node[],
  connections: Connection[], 
) : Node[] => {
  // If no connections, return node as-is.
  if(connections.length === 0) {
    return nodes;
  }

  // Create edges for toposort
  const edges: [string, string][] = connections.map((conn) => [
    conn.fromNodeId,
    conn.toNodeId,
  ]);

  // Add nodes with no connections as self-edges to ensure included
  const connectedNodeIds = new Set<string>();
  for(const conn of connections) {
    connectedNodeIds.add(conn.fromNodeId);
    connectedNodeIds.add(conn.toNodeId);
  }
  for(const node of nodes) {
    if(!connectedNodeIds.has(node.id)) {
      edges.push([node.id, node.id]);
    }
  }

  // Perform topological sort
  let sortedNodeIds: string[];
  try {
    sortedNodeIds = toposort(edges);
    // Remove duplicates (from self-edges)
    sortedNodeIds = [...new Set(sortedNodeIds)];
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cyclic")) {
      console.error("Topological sort failed:", error);
      return nodes;
    }
    throw error;
  }

  // Map sorted IDs back to node objects
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return sortedNodeIds.map((id) => nodeMap.get(id)!).filter(Boolean); 
}