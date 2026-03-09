import "server-only";
import { z } from "zod";
import { helmSbomResponseSchema } from "@/features/device-groups/types";

type helmSbomResponse = z.infer<typeof helmSbomResponseSchema>;

const HELM_URL = process.env.HELM_URL;
const HELM_TOKEN = process.env.HELM_TOKEN;
const HELM_TIMEOUT = 15 * 1000; // Max wait of 15 seconds for Helm to respond

/**
 * Fetches an SBOM from Helm via the deviceGroupId
 */
export async function fetchSbom(
  deviceGroupId: string,
): Promise<helmSbomResponse> {

  if (!HELM_URL || !HELM_TOKEN) {
    throw new Error("HELM URL and/or token missing from Viper's environment variables.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HELM_TIMEOUT);

  const res = await fetch(`${HELM_URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HELM_TOKEN}`,
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
