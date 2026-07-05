import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

type Context = {
  params: {
    id: string;
  };
};

export async function GET(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();

    const keyword = await prisma.keyword.findFirst({
      where: { id: context.params.id, siteId: site.id },
      include: {
        serps: {
          orderBy: { fetchedAt: 'desc' },
          take: 10
        },
        signals: {
          orderBy: { observedAt: 'desc' },
          take: 10,
          include: {
            opportunity: {
              select: { id: true, title: true, status: true }
            }
          }
        }
      }
    });
    if (!keyword) {
      return fail(req, 404, 'NOT_FOUND', 'keyword not found');
    }

    const relatedOpportunities = keyword.signals
      .filter((signal) => signal.opportunity)
      .map((signal) => signal.opportunity!)
      .filter((opportunity, index, all) => all.findIndex((item) => item.id === opportunity.id) === index);

    const keywordNodeId = `kw:${keyword.id}`;
    const signalNodes = keyword.signals.map((signal) => ({
      id: `sg:${signal.id}`,
      label: signal.title,
      type: 'signal',
      score: Number(signal.score.toFixed(2))
    }));
    const opportunityNodes = relatedOpportunities.map((opportunity) => ({
      id: `op:${opportunity.id}`,
      label: opportunity.title,
      type: 'opportunity',
      score: 0
    }));

    const edges: Array<{ from: string; to: string; relation: string; weight: number }> = [];
    keyword.signals.forEach((signal) => {
      edges.push({
        from: keywordNodeId,
        to: `sg:${signal.id}`,
        relation: signal.source,
        weight: Number(signal.score.toFixed(2))
      });
      if (signal.opportunityId) {
        edges.push({
          from: `sg:${signal.id}`,
          to: `op:${signal.opportunityId}`,
          relation: 'drives',
          weight: Number(signal.score.toFixed(2))
        });
      }
    });

    return ok(req, {
      id: keyword.id,
      siteId: keyword.siteId,
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
      serps: keyword.serps.map((serp) => ({
        id: serp.id,
        provider: serp.provider,
        locale: serp.locale,
        device: serp.device,
        rank: serp.rank,
        url: serp.url,
        title: serp.title,
        snippet: serp.snippet,
        resultCount: serp.resultCount,
        fetchedAt: serp.fetchedAt
      })),
      signals: keyword.signals.map((signal) => ({
        id: signal.id,
        type: signal.type,
        source: signal.source,
        severity: signal.severity,
        score: signal.score,
        title: signal.title,
        summary: signal.summary,
        observedAt: signal.observedAt,
        actionLabel: signal.actionLabel,
        actionHref: signal.actionHref
      })),
      opportunities: relatedOpportunities.map((opportunity) => ({
        id: opportunity.id,
        title: opportunity.title,
        status: opportunity.status,
        href: `/dashboard/opportunities/${opportunity.id}?siteId=${encodeURIComponent(site.id)}`
      })),
      opportunitiesCtaHref: `/dashboard/opportunities?keywordId=${encodeURIComponent(keyword.id)}`,
      keywordGraph: {
        nodes: [
          {
            id: keywordNodeId,
            label: keyword.term,
            type: 'keyword',
            score: keyword.priority
          },
          ...signalNodes,
          ...opportunityNodes
        ],
        edges,
        clusters: [
          { id: 'keyword', label: 'Keyword', count: 1 },
          { id: 'signal', label: 'Signals', count: signalNodes.length },
          { id: 'opportunity', label: 'Opportunities', count: opportunityNodes.length }
        ]
      }
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
