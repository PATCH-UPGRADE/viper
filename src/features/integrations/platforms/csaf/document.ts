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
