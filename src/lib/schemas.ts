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
