import {NonRetriableError } from "inngest"; 
import { inngest } from "./client";
import  prisma  from "@/lib/db";
import { topologicalSort } from "./utils";
import { NodeType } from "@/generated/prisma";
import { getExecutor } from "@/features/executions/lib/executor-registry";

export const executeWorkflow = inngest.createFunction(
  { id: "execute-workflow" },
  { event: "workflows/execute.workflow" },
  async ({ event, step }) => {
    const workflowId = event.data.workflowId;
    
    if(!workflowId) {
      throw new NonRetriableError("Workflow ID is missing");
    }

      const sortedNodes = await step.run ('prepare-workflow', async () => {
        const workflow = await prisma.workflow.findUniqueOrThrow({
          where: { id: workflowId },
          include: { nodes: true, connections: true },
        });
        return topologicalSort(workflow.nodes, workflow.connections);
      });

      // Initialize the context with any initial data from the trigger

      let context = event.data.initialData || {} ;

      // Execute node
      for (const node of sortedNodes) { 
        const executor = getExecutor(node.type as NodeType);

        // Each executor extends the context as it runs.  
        context = await executor({
          data: node.data as Record<string, unknown>,
          nodeId: node.id,
          context,
          step
        }); 
      }

      return { 
        workflowId, 
        result: context 
      };
  },
);
