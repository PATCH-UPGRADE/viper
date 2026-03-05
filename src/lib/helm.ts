import "server-only";
import { z } from "zod";
import { helmSbomResponseSchema } from "@/features/device-groups/types";

type helmSbomResponse = z.infer<typeof helmSbomResponseSchema>;

/**
 * Fetches an SBOM from Helm via the deviceGroupId
 */
export async function fetchSbom(
  deviceGroupId: string,
): Promise<helmSbomResponse> {
  const API_TOKEN = process.env.HELM_TOKEN;
  const URL = "https://helm-api.com/api/helm-get-sbom";

  if (!API_TOKEN) {
    throw new Error("HELM_TOKEN is missing in Viper's environment variables");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // Max wait of 15 seconds for Helm to respond

  const res = await fetch(`${URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device_group_id: deviceGroupId,
    }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  // Helm responds with a different schema for a 404. Normalizing it so that Viper's responses stay consistent.
  if (res.status === 404) {
    return {
      success: false,
      error_type: "NOT FOUND",
      message: "The device group was not found in Helm.",
    };
  }

  if (!res.ok) {
    throw new Error(`Helm API responded with ${res.status}`);
  }

  const json = await res.json();
  return helmSbomResponseSchema.parse(json);
}
