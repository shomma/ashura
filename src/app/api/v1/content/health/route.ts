import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

const ALLOWED_SEGMENTS = new Set(['drop', 'rankDown', 'highBounce', 'lowRevenue']);

type HealthItem = {
  id: string;
  segment: string;
  postId: string;
  title: string;
  impact: number;
  reason: string;
  confidence: number;
};

function resolveSegment(score: number, source: string) {
  const sourceLower = source.toLowerCase();
  if (sourceLower.includes('trend')) return 'drop';
  if (score < 35) return 'lowRevenue';
  if (score < 50) return 'rankDown';
  if (score < 65) return 'highBounce';
  return 'drop';
}

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const segment = searchParams.get('segment')?.trim();
    const limitRaw = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;

    if (segment && !ALLOWED_SEGMENTS.has(segment)) {
      return fail(req, 400, 'BAD_REQUEST', 'segment must be drop, rankDown, highBounce, lowRevenue');
    }

    const site = await requireSingleSite();

    const opportunities = await prisma.opportunity.findMany({
      where: { siteId: site.id },
      orderBy: [{ score: 'asc' }, { confidence: 'asc' }, { updatedAt: 'desc' }],
      take: limit
    });

    const items: HealthItem[] = opportunities.map((opportunity) => {
      const score = Number(opportunity.score ?? 0);
      const confidence = Number(opportunity.confidence ?? 0);
      return {
        id: opportunity.id,
        postId: opportunity.id,
        segment: resolveSegment(score, opportunity.source),
        title: opportunity.title,
        impact: score,
        reason: opportunity.summary || opportunity.why || '',
        confidence
      };
    });

    const filtered = segment ? items.filter((item) => item.segment === segment) : items;
    const summary = {
      total: filtered.length,
      drop: filtered.filter((item) => item.segment === 'drop').length,
      rankDown: filtered.filter((item) => item.segment === 'rankDown').length,
      highBounce: filtered.filter((item) => item.segment === 'highBounce').length,
      lowRevenue: filtered.filter((item) => item.segment === 'lowRevenue').length
    };

    return ok(req, {
      siteId: site.id,
      segment: segment || 'all',
      summary,
      items: filtered
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
