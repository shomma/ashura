import { NextResponse } from 'next/server';
import { ensureWatchKeyword, listWatchKeywords } from '@/lib/epg/ingest';

export const runtime = 'nodejs';

export async function GET() {
  const rows = await listWatchKeywords();
  return NextResponse.json({ items: rows });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { keyword?: string; keywords?: string[] | string };
    const keywords = normalizeKeywords(body);
    if (!keywords.length) {
      return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
    }
    await Promise.all(keywords.map((keyword) => ensureWatchKeyword(keyword)));
    const rows = await listWatchKeywords();
    return NextResponse.json({ ok: true, items: rows, added: keywords.length });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

function normalizeKeywords(body: { keyword?: string; keywords?: string[] | string }) {
  if (Array.isArray(body.keywords)) {
    return body.keywords.map((keyword) => keyword.trim()).filter(Boolean);
  }
  if (typeof body.keywords === 'string') {
    return splitKeywords(body.keywords);
  }
  if (typeof body.keyword === 'string') {
    return splitKeywords(body.keyword);
  }
  return [];
}

function splitKeywords(value: string) {
  return value
    .split(/[,\n、]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
