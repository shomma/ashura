import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fromRaw = searchParams.get('from');
    const toRaw = searchParams.get('to');

    const from = new Date(fromRaw || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const to = new Date(toRaw || new Date());
    const site = await requireSingleSite();

    const opportunities = await prisma.opportunity.findMany({
      where: { siteId: site.id },
      orderBy: { createdAt: 'desc' }
    });

    const outcomes = await prisma.taskOutcome.findMany({
      where: {
        siteId: site.id,
        executedAt: { gte: from, lte: to },
      },
      orderBy: { executedAt: 'desc' }
    });

    const accuracy = opportunities.length
      ? opportunities.reduce((sum, item) => sum + Number(item.score || 0), 0) / Math.max(1, opportunities.length)
      : 0;

    const adoptionRate = outcomes.length
      ? outcomes.filter((outcome) => outcome.status === 'done').length / Math.max(1, opportunities.length)
      : 0;

    return ok(req, {
      siteId: site.id,
      window: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        opportunityCount: opportunities.length,
        outcomeCount: outcomes.length,
        adoptionRate: Number(adoptionRate.toFixed(4)),
        averageScore: Number(accuracy.toFixed(2)),
        modelVersion: opportunities.length ? opportunities[0].status : null
      },
      stats: {
        pendingOpportunities: opportunities.filter((item) => item.status === 'open').length,
        doneOpportunities: opportunities.filter((item) => item.status === 'done').length,
        doneTasks: outcomes.filter((item) => item.status === 'done').length
      }
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
