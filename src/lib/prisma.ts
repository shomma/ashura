import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL ||=
  process.env.NODE_ENV === 'production' ? 'file:/var/data/ashura.db' : 'file:./data/ashura.db';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error', 'warn']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
