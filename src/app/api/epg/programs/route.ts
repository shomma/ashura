import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const limit = clampNumber(Number(searchParams.get('limit') ?? DEFAULT_LIMIT), 1, MAX_LIMIT);
    const offset = clampNumber(Number(searchParams.get('offset') ?? 0), 0, 100_000);

    const range = await resolveProgramRange({ dateParam, startParam, endParam });
    if (!range) {
      return NextResponse.json({ error: 'date or start/end is required' }, { status: 400 });
    }
    if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime())) {
      return NextResponse.json({ error: 'invalid date' }, { status: 400 });
    }
    if (range.end <= range.start) {
      return NextResponse.json({ error: 'end must be after start' }, { status: 400 });
    }

    const where = {
      start: { gte: range.start },
      end: { lte: range.end }
    };

    const [total, rows] = await Promise.all([
      prisma.program.count({ where }),
      prisma.program.findMany({
        where,
        include: { channel: true },
        orderBy: [{ start: 'asc' }, { channelId: 'asc' }],
        take: limit,
        skip: offset
      })
    ]);

    const programs = rows.map((p) => ({
      id: p.id,
      channelId: p.channelId,
      channelName: p.channel?.name ?? '',
      title: p.title,
      summary: p.summary,
      start: p.start.toISOString(),
      end: p.end.toISOString(),
      date: p.date.toISOString(),
      url: p.url
    }));

    return NextResponse.json({
      programs,
      total,
      limit,
      offset,
      range: {
        start: range.start.toISOString(),
        end: range.end.toISOString()
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

async function resolveProgramRange(params: {
  dateParam: string | null;
  startParam: string | null;
  endParam: string | null;
}) {
  const { dateParam, startParam, endParam } = params;

  if (startParam || endParam) {
    if (!startParam || !endParam) return null;
    const start = startOfDay(new Date(startParam));
    const end = addDays(startOfDay(new Date(endParam)), 1);
    return { start, end };
  }

  if (dateParam) {
    const start = startOfDay(new Date(dateParam));
    return { start, end: addDays(start, 1) };
  }

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

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
