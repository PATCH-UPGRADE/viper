import { z } from "zod";

/**
 * Shared Zod schema for User responses
 * Matches Prisma User model (name and email are required, image is nullable)
 */
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  image: z.string().nullable(),
});
export type UserIncludeType = z.infer<typeof userSchema>;

/**
 * Shared user include/select pattern for Prisma queries
 * Use this consistently across all routers when including user relations
 */
export const userIncludeSelect = {
  select: {
    id: true,
    name: true,
    email: true,
    image: true,
  },
} as const;

export const deviceGroupSchema = z.object({
  id: z.string(),
  cpe: z.string(),
});
export type DeviceGroupIncludeType = z.infer<typeof deviceGroupSchema>;
export const deviceGroupWithUrlsSchema = deviceGroupSchema.extend({
  url: z.string(),
  sbomUrl: z.string().nullable(), // TODO: VW-54
  vulnerabilitiesUrl: z.string(),
  emulatorsUrl: z.string(),
  assetsUrl: z.string(),
});
export type DeviceGroupWithUrls = z.infer<typeof deviceGroupWithUrlsSchema>;
export const deviceGroupWithDetailsSchema = deviceGroupWithUrlsSchema.extend({
  manufacturer: z.string().nullable(),
  modelName: z.string().nullable(),
  version: z.string().nullable(),
  helmSbomId: z.string().nullable(),
});
export type DeviceGroupWithDetails = z.infer<
  typeof deviceGroupWithDetailsSchema
>;

export const deviceGroupSelect = {
  select: {
    id: true,
    cpe: true,
    url: true,
    sbomUrl: true,
    vulnerabilitiesUrl: true,
    assetsUrl: true,
    emulatorsUrl: true,
  },
} as const;

/**
 * Reusable URL validator to prevent javascript: and other dangerous protocols
 * Only allows http, https, and git protocols
 */
export const safeUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => {
      try {
        const protocol = new URL(url).protocol;
        return (
          protocol === "http:" || protocol === "https:" || protocol === "git:"
        );
      } catch {
        return false;
      }
    },
    { message: "Only http(s) and git URLs allowed" },
  );

/**
 * CPE 2.3 format validator
 * Validates Common Platform Enumeration strings
 */
export const cpeSchema = z
  .string()
  .regex(/^cpe:2\.3:[^:]+:[^:]+:[^:]+/, "Invalid CPE 2.3 format");
