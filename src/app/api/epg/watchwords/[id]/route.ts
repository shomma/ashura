import { NextResponse } from 'next/server';
import { deleteWatchKeyword, listWatchKeywords, toggleWatchKeyword } from '@/lib/epg/ingest';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { active } = (await req.json()) as { active: boolean };
    await toggleWatchKeyword(params.id, Boolean(active));
    const rows = await listWatchKeywords();
    return NextResponse.json({ ok: true, items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteWatchKeyword(params.id);
    const rows = await listWatchKeywords();
    return NextResponse.json({ ok: true, items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
