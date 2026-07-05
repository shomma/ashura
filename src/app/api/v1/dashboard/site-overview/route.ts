import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { findProgramHits } from '@/lib/epg/ingest';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const site = await requireSingleSite();

    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      signals24h,
      openOpportunities,
      pendingRecommendations,
      openAlerts,
      tasksOpen,
      tasksDone7d,
      outcomes7d,
      epgDays,
      latestEpg,
      upcomingPrograms,
      watchwordCount,
      hitCandidates
    ] = await Promise.all([
      prisma.signal.count({
        where: { siteId: site.id, observedAt: { gte: since24h } }
      }),
      prisma.opportunity.count({
        where: { siteId: site.id, status: { in: ['open', 'in_progress'] } }
      }),
      prisma.recommendation.count({
        where: { siteId: site.id, status: { in: ['pending', 'in_progress'] } }
      }),
      prisma.alert.count({
        where: { siteId: site.id, status: 'open' }
      }),
      prisma.task.count({
        where: { siteId: site.id, status: { in: ['pending', 'in_progress', 'running'] } }
      }),
      prisma.task.count({
        where: {
          siteId: site.id,
          status: { in: ['done', 'completed'] },
          updatedAt: { gte: since7d }
        }
      }),
      prisma.taskOutcome.aggregate({
        where: {
          siteId: site.id,
          executedAt: { gte: since7d }
        },
        _count: { _all: true },
        _sum: { scoreDelta: true }
      }),
      prisma.epgHtml.count(),
      prisma.epgHtml.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true, _count: { select: { programs: true } } }
      }),
      prisma.program.count({
        where: { start: { gte: now, lt: next7d } }
      }),
      prisma.watchKeyword.count({
        where: { active: true }
      }),
      findProgramHits({ start: now, end: next7d, limitPerKeyword: 10 })
    ]);

    return ok(req, {
      siteId: site.id,
      siteName: site.name,
      refreshedAt: now.toISOString(),
      stages: {
        collection: {
          signals24h,
          epgDays,
          epgUpcomingPrograms: upcomingPrograms,
          epgHitCandidates: hitCandidates.length,
          watchwordCount
        },
        planning: {
          openOpportunities,
          pendingRecommendations,
          openAlerts,
          draftPlans7d: pendingRecommendations
        },
        execution: {
          tasksOpen,
          tasksDone7d,
          outcomes7d: outcomes7d._count._all ?? 0
        },
        analysis: {
          scoreDelta7d: outcomes7d._sum.scoreDelta ?? 0
        }
      },
      epg: {
        days: epgDays,
        latestDate: latestEpg?.date?.toISOString() ?? null,
        latestProgramCount: latestEpg?._count.programs ?? 0,
        upcomingPrograms,
        hitCandidates: hitCandidates.length,
        watchwordCount
      }
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
