import { hashPassword } from "better-auth/crypto";
import prisma from "@/lib/db";

// Seed user credentials
export const SEED_USER = {
  email: "user@example.com",
  password: "1337_gone_jolene",
  name: "Seed User",
  phone: "Ext. 3104",
};

export async function createOrGetSeedUser() {
  console.log("\n👤 Creating/finding seed user...");

  let user = await prisma.user.findUnique({
    where: { email: SEED_USER.email },
  });

  if (user) {
    console.log(`✅ Seed user already exists: ${SEED_USER.email}`);
    return prisma.user.update({
      where: { id: user.id },
      data: { phone: SEED_USER.phone },
    });
  }

  const hashedPassword = await hashPassword(SEED_USER.password);

  user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: SEED_USER.email,
      name: SEED_USER.name,
      phone: SEED_USER.phone,
      emailVerified: true,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: SEED_USER.email,
          providerId: "credential",
          password: hashedPassword,
        },
      },
    },
  });

  console.log(`✅ Created seed user: ${SEED_USER.email}`);
  return user;
}
