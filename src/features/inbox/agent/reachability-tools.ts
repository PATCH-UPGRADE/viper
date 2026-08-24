// SPIKE VW-425
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { StructuredToolInterface } from "@langchain/core/tools";

const MCP_URL = process.env.MCP_URL || "http://localhost:3000/api/mcp";
const DEFAULT_TIMEOUT = 60_000;

let client: MultiServerMCPClient | null = null;

function getClient() {
  client ??= new MultiServerMCPClient({
    mcpServers: {
      reachability: {
        transport: "http",
        url: MCP_URL,
        defaultToolTimeout: DEFAULT_TIMEOUT,
      },
    },
  });

  return client;
}

function withFailSafe(
  tool: StructuredToolInterface,
  guidance: string,
): StructuredToolInterface {
  const original = tool.invoke.bind(tool);
  tool.invoke = async (input: any, config?: any) => {
    try {
      return await original(input, config);
    } catch (err) {
      return JSON.stringify({
        error: "reachability_unavailable",
        message: err instanceof Error ? err.message : String(err),
        guidance: "Reachability could not be determined. Treat it as UNKNOWN",
      });
    }
  };
  return tool;
}

async function allTools(): Promise<StructuredToolInterface[]> {
  return await getClient().getTools();
}

const CONFIG: Record<
  "vex" | "triage" | "mitigate",
  { name: string[]; guidance: string }
> = {
  vex: {
    name: ["check_reachability", "check_internet_exposure"],
    guidance: "",
  },
  triage: {
    name: ["assess_lateral_movement"],
    guidance: "",
  },
  mitigate: {
    name: [],
    guidance: "",
  },
};

export async function getReachabilityTools(
  agent: "vex" | "triage" | "mitigate",
): Promise<StructuredToolInterface[]> {
  const config = CONFIG[agent];

  return (await allTools())
    .filter((tool) => config.name.includes(tool.name))
    .map((tool) => withFailSafe(tool, config.guidance));
}
