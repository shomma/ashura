import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { findProgramHits } from '@/lib/epg/ingest';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const limit = Number(searchParams.get('limit') ?? '5');

    const range = startParam || endParam
      ? resolveExplicitRange(startParam, endParam)
      : await resolveFetchedRange();

    if (!range || Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime())) {
      return NextResponse.json({ error: 'invalid date' }, { status: 400 });
    }

    const hits = await findProgramHits({
      start: range.start,
      end: range.end,
      limitPerKeyword: Number.isFinite(limit) ? limit : 5
    });

    return NextResponse.json({
      items: hits,
      range: {
        start: range.start.toISOString(),
        end: range.end.toISOString()
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

function resolveExplicitRange(startParam: string | null, endParam: string | null) {
  if (!startParam || !endParam) return null;
  const start = startOfDay(new Date(startParam));
  const end = addDays(startOfDay(new Date(endParam)), 1);
  return { start, end };
}

async function resolveFetchedRange() {
  const today = startOfDay(new Date());
  const fetchedDays = await prisma.epgHtml.findMany({
    where: { date: { gte: today } },
    orderBy: { date: 'asc' },
    select: { date: true }
  });

  if (!fetchedDays.length) {
    return { start: today, end: addDays(today, 7) };
  }

  return {
    start: startOfDay(fetchedDays[0].date),
    end: addDays(startOfDay(fetchedDays[fetchedDays.length - 1].date), 1)
  };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
