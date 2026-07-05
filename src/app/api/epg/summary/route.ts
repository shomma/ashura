import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // build時に静的化されてDB接続が走らないようにする

export async function GET() {
  const epgs = await prisma.epgHtml.findMany({
    orderBy: { date: 'asc' },
    include: { _count: { select: { programs: true } } }
  });

  const days = epgs.map((e) => ({
    id: e.id,
    area: e.area,
    date: e.date.toISOString(),
    head: e.head,
    url: e.url,
    programCount: e._count.programs
  }));

  return NextResponse.json({ days });
}
