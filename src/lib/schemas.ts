import z from "zod";

/**
 * Shared Zod schema for User responses
 * Matches Prisma User model (name and email are required, image is nullable)
 */
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
});

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
        return protocol === "http:" || protocol === "https:" || protocol === "git:";
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
