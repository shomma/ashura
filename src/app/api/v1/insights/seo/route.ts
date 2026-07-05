import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

function parseDate(raw: string | null, fallback: Date) {
  if (!raw) return fallback;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? fallback : value;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseDate(searchParams.get('from'), new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const to = parseDate(searchParams.get('to'), new Date());
    const site = await requireSingleSite();

    const outcomes = await prisma.taskOutcome.findMany({
      where: {
        siteId: site.id,
        executedAt: { gte: from, lte: to }
      },
      include: {
        task: {
          select: { action: true, opportunityId: true }
        }
      },
      orderBy: { executedAt: 'desc' }
    });

    const opportunities = await prisma.opportunity.findMany({
      where: {
        siteId: site.id
      },
      orderBy: { score: 'desc' },
      take: 50
    });

    const completedCount = outcomes.filter((outcome) => outcome.status === 'done').length;
    const withTask = opportunities.filter((item) => item.status === 'tasked' || item.status === 'done').length;

    return ok(req, {
      siteId: site.id,
      window: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        opportunities: opportunities.length,
        taskedOpportunities: withTask,
        completedOutcomes: completedCount,
        completionRate: opportunities.length ? Number((completedCount / opportunities.length).toFixed(4)) : 0
      },
      trends: opportunities.map((item) => ({
        id: item.id,
        title: item.title,
        score: item.score,
        confidence: item.confidence,
        status: item.status,
        updatedAt: item.updatedAt
      })),
      recentOutcomes: outcomes.map((outcome) => ({
        id: outcome.id,
        taskId: outcome.taskId,
        opportunityId: outcome.opportunityId,
        taskAction: outcome.task?.action ?? null,
        status: outcome.status,
        scoreDelta: outcome.scoreDelta,
        executedAt: outcome.executedAt,
        outcome: outcome.outcome
      }))
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
