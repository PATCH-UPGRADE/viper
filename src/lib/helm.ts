import "server-only"
import type { helmSbomResponseSchema } from "@/features/device-groups/types"
import { z } from "zod"

type helmSbomResponse = z.infer<typeof helmSbomResponseSchema>

export async function fetchSbom(deviceGroupId: string): Promise<helmSbomResponse> {
    const API_TOKEN = process.env.HELM_TOKEN;
    const BASE_URL = 'https://helm-api.com/api/helm-get-sbom';

    if (!API_TOKEN) {
        throw new Error("HELM_TOKEN is missing in Viper's environment variables")
    }

    const res = await fetch(`${BASE_URL}?device_group_id=${deviceGroupId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });

    // TODO: Helm returns a different payload entirely on 404 instead of setting success to `false`
    if (res.status === 404) {
    };

    if (!res.ok) {
        throw new Error(`Helm API responded with ${res.status}`)
    }

    return res.json();
}