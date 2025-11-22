import { PrismaClient } from "@/generated/prisma";
import { createServerSingleton } from "./singleton";

const getPrisma = createServerSingleton("prisma", () => new PrismaClient());

export default getPrisma();
