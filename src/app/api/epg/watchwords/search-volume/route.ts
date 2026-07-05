import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { fetchKeywordMonthlyTrendIndices } from '@/lib/trends/googleTrends';

type SearchVolumeBody = {
  keywords?: string[];
  months?: number;
};

const SEARCH_VOLUME_NOTE =
  'Google Trendsは相対指数(0-100)です。厳密な月間検索数はGoogle Ads Keyword Planner APIの連携が必要です。';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const months = Number(searchParams.get('months') || 1);
    const limit = Number(searchParams.get('limit') || 120);
    const watchwords = await prisma.watchKeyword.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(300, limit))
    });
    const keywords = watchwords.map((row) => row.keyword);
    const items = await fetchKeywordMonthlyTrendIndices({
      keywords,
      months
    });
    return NextResponse.json({
      ok: true,
      mode: 'trend_index',
      note: SEARCH_VOLUME_NOTE,
      generatedAt: new Date().toISOString(),
      items
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = (await req.json()) as SearchVolumeBody;
    const keywords = normalizeKeywords(body.keywords);
    if (keywords.length === 0) {
      return NextResponse.json({ ok: true, mode: 'trend_index', note: SEARCH_VOLUME_NOTE, items: [] });
    }
    const items = await fetchKeywordMonthlyTrendIndices({
      keywords,
      months: body.months
    });
    return NextResponse.json({
      ok: true,
      mode: 'trend_index',
      note: SEARCH_VOLUME_NOTE,
      generatedAt: new Date().toISOString(),
      items
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

function normalizeKeywords(raw?: string[]) {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((keyword) => keyword.trim()).filter(Boolean))).slice(0, 120);
}
