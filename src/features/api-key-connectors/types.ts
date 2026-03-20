import { userSchema } from "better-auth";
import z from "zod";
import { ResourceType } from "@/generated/prisma";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import { userIncludeSelect } from "@/lib/schemas";

export const connectorResponseSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  resourceType: z.string().nullable(),
  lastRequest: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  apiKeyId: z.string().nullable(),
  integrationId: z.string().nullable(),
  userId: z.string(),
  user: userSchema,
});

export const paginatedConnectorInputSchema = paginationInputSchema.extend({
  resourceType: z.enum(ResourceType),
});

export const paginatedConnectorOutputSchema = createPaginatedResponseSchema(
  connectorResponseSchema,
);

export type ConnectorResponse = z.infer<typeof connectorResponseSchema>;
export type paginatedConnectorsByTypeInput = z.infer<
  typeof paginatedConnectorInputSchema
>;

// { "Asset": 2, "Vulnerability": 5, "Remediation": 3, ... }
export const resourceTypeCountSchema = z.object(
  Object.fromEntries(
    Object.values(ResourceType).map((type) => [type, z.number()]),
  ),
);

export const connectorCountResponseSchema = z.object({
  activeCount: resourceTypeCountSchema,
  totalCount: resourceTypeCountSchema,
});

export const connectorInclude = {
  user: userIncludeSelect,
} as const;
