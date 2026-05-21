import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __moaPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.__moaPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__moaPrisma = prisma;
}
