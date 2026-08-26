import "server-only";
import type { z } from "zod";
import type { PlatformEnum } from "@/generated/prisma";
import type { Category, FieldSpec } from "../types";
import { usesGenericAuth } from "./credentials";
import { registry } from "./registry";
import type { AnyConnectorModule } from "./types";

const shapeOf = (schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> =>
  "shape" in schema ? (schema.shape as Record<string, z.ZodTypeAny>) : {};

// biome-ignore-start lint/suspicious/noExplicitAny: introspecting Zod's own internals (shape/unwrap/options) — `unknown` does not expose them, same tradeoff as AnyConnectorModule in core/types.ts.
const fieldSpecsFor = (schema: z.ZodTypeAny): FieldSpec[] =>
  Object.entries(shapeOf(schema)).map(([key, field]) => {
    const optional = field.isOptional();
    const required = !optional;
    const inner: any = optional ? (field as any).unwrap() : field;
    if (inner.def.type === "enum") {
      return { key, kind: "select" as const, required, options: inner.options };
    }
    if (inner.def.type === "number") {
      return { key, kind: "number", required };
    }
    const kind = /password|secret|token/i.test(key)
      ? ("password" as const)
      : /url|uri/i.test(key)
        ? ("url" as const)
        : ("text" as const);
    return { key, kind, required };
  });
// biome-ignore-end lint/suspicious/noExplicitAny: see comment above

export interface CatalogEntry {
  platform: PlatformEnum;
  displayName: string;
  description: string;
  categories: Category[];
  configFields: FieldSpec[];
  credentialFields: FieldSpec[];
  credentialsAreAuthShaped: boolean;
}

/**
 * Every registered platform, reduced to plain data so a Server Component can
 * hand it to the Client Component catalog without crossing the server-only
 * boundary (`registry` pulls in `node:crypto` via `core/credentials.ts`).
 */
export const catalogEntries = (): CatalogEntry[] =>
  (Object.values(registry) as AnyConnectorModule[]).map((module) => {
    const { definition } = module;
    return {
      platform: definition.platform,
      displayName: definition.displayName,
      description: definition.description,
      categories: definition.categories,
      configFields: fieldSpecsFor(definition.configSchema),
      credentialFields: fieldSpecsFor(definition.credentialSchema),
      credentialsAreAuthShaped: usesGenericAuth(definition.credentialSchema),
    };
  });
