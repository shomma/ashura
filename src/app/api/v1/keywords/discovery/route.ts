import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim().toLowerCase() || '';
    const limitRaw = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;

    const site = await requireSingleSite();

    const keywords = await prisma.keyword.findMany({
      where: {
        siteId: site.id,
        ...(q
          ? {
              OR: [
                { term: { contains: q } },
                { normalizedTerm: { contains: q } }
              ]
            }
          : {})
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      include: {
        _count: { select: { serps: true, signals: true } }
      }
    });

    return ok(req, {
      siteId: site.id,
      items: keywords.map((keyword) => ({
        id: keyword.id,
        term: keyword.term,
        normalizedTerm: keyword.normalizedTerm,
        intent: keyword.intent,
        status: keyword.status,
        priority: keyword.priority,
        difficulty: keyword.difficulty,
        volume: keyword.volume,
        cpc: keyword.cpc,
        latestSerpAt: keyword.latestSerpAt,
        lastSignalAt: keyword.lastSignalAt,
        serpCount: keyword._count.serps,
        signalCount: keyword._count.signals,
        detailHref: `/dashboard/keywords/${keyword.id}?siteId=${encodeURIComponent(site.id)}`
      }))
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
