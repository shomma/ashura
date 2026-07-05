import { PrismaClient } from '@prisma/client';
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';

function ensureSqliteFile(url: string) {
  if (!url.startsWith('file:')) return;

  const dbPath = url.slice('file:'.length);
  if (!dbPath) return;

  const parentDir = dirname(dbPath);
  if (dbPath.startsWith('/')) {
    if (!existsSync(parentDir)) return;
  } else {
    mkdirSync(parentDir, { recursive: true });
  }

  const fd = openSync(dbPath, 'a');
  closeSync(fd);
}

process.env.DATABASE_URL ||=
  process.env.NODE_ENV === 'production' ? 'file:/var/data/ashura.db' : 'file:./data/ashura.db';

ensureSqliteFile(process.env.DATABASE_URL);

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
