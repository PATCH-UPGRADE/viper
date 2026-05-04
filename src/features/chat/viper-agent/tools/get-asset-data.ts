import { createTool } from "@inngest/agent-kit";
import { z } from "zod";

export const getAssetData = createTool({
  name: "get_asset_data",
  description:
    "Returns detailed information about the asset currently being discussed, including its vulnerabilities and remediations. Always call this tool before answering questions about the asset.",
  parameters: z.object({}),
  handler: async (_, { network }) => {
    const asset = network?.state.data.assetData;
    if (!asset) return "No asset data available.";

    const vulnerabilities = asset.issues.map(
      (i: { vulnerability: unknown }) => i.vulnerability,
    );

    const seen = new Set<string>();
    const remediations: unknown[] = [];
    for (const vuln of vulnerabilities as Array<{
      remediations: Array<{ id: string }>;
    }>) {
      for (const rem of vuln.remediations) {
        if (!seen.has(rem.id)) {
          seen.add(rem.id);
          remediations.push(rem);
        }
      }
    }

    return [
      `## Asset: ${asset.hostname ?? asset.ip} (ID: ${asset.id})`,
      "",
      `- **Role**: ${asset.role ?? "Unknown"}`,
      `- **IP**: ${asset.ip ?? "N/A"}`,
      `- **Hostname**: ${asset.hostname ?? "N/A"}`,
      `- **Location**: ${asset.location ?? "N/A"}`,
      `- **Network Segment**: ${asset.networkSegment ?? "N/A"}`,
      `- **MAC Address**: ${asset.macAddress ?? "N/A"}`,
      `- **CPE**: ${asset.cpe ?? "N/A"}`,
      `- **Patch Status**: ${asset.patchStatus ?? "N/A"}`,
      "",
      "## Associated Vulnerabilities",
      "",
      JSON.stringify(vulnerabilities, null, 2),
      "",
      "## Remediations",
      "",
      JSON.stringify(remediations, null, 2),
    ].join("\n");
  },
});
