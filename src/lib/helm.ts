import "server-only"
import type { helmSbomResponseSchema } from "@/features/device-groups/types"
import { z } from "zod"

type helmSbomResponse = z.infer<typeof helmSbomResponseSchema>

export async function fetchSbom(deviceGroupId: string): Promise<helmSbomResponse> {
    const API_TOKEN = process.env.HELM_TOKEN;
    const URL = 'https://helm-api.com/api/helm-get-sbom';

    if (!API_TOKEN) {
        throw new Error("HELM_TOKEN is missing in Viper's environment variables")
    }

    const res = await fetch(`${URL}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            'device_group_id': deviceGroupId,
        }),
    });

    // Helm responds with a different schema for a 404. Normalizing it so that Viper's responses stay consistent.
    if (res.status === 404) {
        return {
            success: false,
            error_type: "NOT FOUND",
            message: "The device group was not found in Helm.",
        };
    };

    if (!res.ok) {
        throw new Error(`Helm API responded with ${res.status}`)
    }

    return res.json();
}