import { z } from "zod";

export const csafDocumentSchema = z.object({
  document: z.object({
    title: z.string(),
    publisher: z.object({ name: z.string() }),
    distribution: z
      .object({ tlp: z.object({ label: z.string() }).optional() })
      .optional(),
    tracking: z.object({
      id: z.string(),
      version: z.string().optional(),
      status: z.string().optional(),
      current_release_date: z.string().optional(),
    }),
    notes: z
      .array(
        z.object({
          category: z.string(),
          title: z.string().optional(),
          text: z.string(),
        }),
      )
      .default([]),
    references: z
      .array(
        z.object({
          category: z.string().optional(),
          summary: z.string().optional(),
          url: z.string(),
        }),
      )
      .default([]),
  }),
  product_tree: z.unknown().optional(),
  vulnerabilities: z
    .array(
      z.object({
        cve: z.string().optional(),
        cwe: z.object({ id: z.string(), name: z.string() }).optional(),
        notes: z
          .array(
            z.object({
              category: z.string(),
              title: z.string().optional(),
              text: z.string(),
            }),
          )
          .default([]),
        product_status: z.record(z.string(), z.array(z.string())).default({}),
        remediations: z
          .array(
            z.object({
              category: z.string(),
              details: z.string(),
              product_ids: z.array(z.string()).default([]),
              url: z.string().optional(),
            }),
          )
          .default([]),
        scores: z
          .array(
            z.object({
              cvss_v3: z.object({
                baseScore: z.number(),
                baseSeverity: z.string(),
                vectorString: z.string(),
              }),
              products: z.array(z.string()).default([]),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export type CsafDocument = z.infer<typeof csafDocumentSchema>;

export interface CsafAdvisoryItem {
  trackingId: string;
  documentUrl: string;
  webUrl?: string;
  markdown: string;
  raw: unknown;
}

export interface ProductTreeIndex {
  productNames: Map<string, string>;
  vendors: string[];
}

export const indexProductTree = (doc: CsafDocument): ProductTreeIndex => {
  const productNames = new Map<string, string>();
  const vendors = new Set<string>();
  const walk = (branches: unknown[]) => {
    for (const branch of branches) {
      if (typeof branch !== "object" || branch === null) continue;
      const node = branch as {
        category?: string;
        name?: string;
        product?: { product_id: string; name?: string };
        branches?: unknown[];
      };
      if (node.category === "vendor" && node.name) vendors.add(node.name);
      if (node.product) {
        productNames.set(
          node.product.product_id,
          node.product.name ?? node.product.product_id,
        );
      }
      if (node.branches) walk(node.branches);
    }
  };
  walk(((doc.product_tree ?? {}) as { branches?: unknown[] }).branches ?? []);
  return { productNames, vendors: [...vendors] };
};
