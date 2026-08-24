// https://www.npmjs.com/package/mcp-handler
// SPIKE VW-425
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  canReach,
  lateralMovement,
  internetExposure,
} from "../../../../spikes/hawksbill/reachtool";
import sample from "../../../../spikes/hawksbill/samples/input_example.json";

const handler = createMcpHandler((server) => {
  server.registerTool(
    "check_reachability",
    {
      title: "Check Reachability",
      description:
        "Determine whether traffic originating at one asset an reach another. Use when assessing whether a vulnerability is exploitable in this environment",
      inputSchema: {
        from: z.string().describe("asset id traffic originates from"),
        to: z.string().optional().describe("asset id to test"),
      },
    },
    async ({ from, to }) => {
      const jsonText = await canReach(sample, from, to);
      return {
        content: [{ type: "text", text: `${JSON.stringify(jsonText)}` }],
      };
    },
  );
  server.registerTool(
    "assess_lateral_movement",
    {
      title: "Assess lateral movement",
      description:
        "Given an asset that is compromised or suspected compromised, identify which other assets an attacker could reach from it, ranked by blast radius. Use when triaging a vulnerability to decide whether it is contained or enables spread.",
      inputSchema: {
        assetId: z.string().describe("asset id of the compromised device"),
      },
    },
    async ({ assetId }) => {
      const jsonText = await lateralMovement(sample, assetId);
      return {
        content: [{ type: "text", text: `${JSON.stringify(jsonText)}` }],
      };
    },
  );
  server.registerTool(
    "check_internet_exposure",
    {
      title: "Internet Exposure",
      description:
        "Determine whether an asset is reachable from the public internet.",
      inputSchema: {
        assetId: z.string().describe("asset id to check"),
      },
    },
    async ({ assetId }) => {
      const jsonText = await internetExposure(sample, assetId);
      return {
        content: [{ type: "text", text: `${JSON.stringify(jsonText)}` }],
      };
    },
  );
});

export { handler as GET, handler as POST };
