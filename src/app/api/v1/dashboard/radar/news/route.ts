import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

function normalizeActionHref(actionHref: string | null, signalId: string) {
  if (actionHref && actionHref.trim().length > 0) return actionHref;
  return `/dashboard/opportunities?signalId=${encodeURIComponent(signalId)}&source=radar-news`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limitRaw = Number(searchParams.get('limit') || '20');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
    const site = await requireSingleSite();

    const signals = await prisma.signal.findMany({
      where: {
        siteId: site.id,
        type: 'news',
        source: 'radar_news'
      },
      orderBy: [{ observedAt: 'desc' }, { score: 'desc' }],
      take: limit
    });

    return ok(req, {
      siteId: site.id,
      radar: 'news',
      items: signals.map((signal) => ({
        id: signal.id,
        type: signal.type,
        source: signal.source,
        severity: signal.severity,
        score: signal.score,
        title: signal.title,
        summary: signal.summary,
        observedAt: signal.observedAt,
        actionLabel: signal.actionLabel ?? 'View opportunities',
        actionHref: normalizeActionHref(signal.actionHref, signal.id)
      }))
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
