import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

function getDayBoundaries() {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);

  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  return { startToday, startYesterday };
}

export async function GET(req: Request) {
  try {
    const site = await requireSingleSite();

    const { startToday, startYesterday } = getDayBoundaries();

    const [
      todayTop10Rows,
      openAlerts,
      recentAlerts,
      taskInProgressCount,
      outcomeInProgressCount,
      yesterdayOutcomes
    ] = await Promise.all([
        prisma.opportunity.findMany({
          where: {
            siteId: site.id,
            OR: [
              { observedAt: { gte: startToday } },
              { observedAt: null, createdAt: { gte: startToday } }
            ]
          },
          orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            score: true,
            confidence: true
          }
        }),
        prisma.alert.groupBy({
          by: ['severity'],
          where: { siteId: site.id, status: 'open' },
          _count: { _all: true }
        }),
        prisma.alert.findMany({
          where: { siteId: site.id, status: 'open' },
          orderBy: { createdAt: 'desc' },
          take: 5
        }),
        prisma.task.count({
          where: {
            siteId: site.id,
            status: { in: ['pending', 'in_progress', 'running'] }
          }
        }),
        prisma.taskOutcome.count({
          where: {
            siteId: site.id,
            status: { in: ['pending', 'running'] }
          }
        }),
        prisma.taskOutcome.aggregate({
          where: {
            siteId: site.id,
            executedAt: { gte: startYesterday, lt: startToday }
          },
          _sum: { scoreDelta: true },
          _count: { _all: true }
        })
      ]);

    const criticalAlerts =
      openAlerts.find((row) => row.severity === 'critical')?._count._all ?? 0;
    const warningAlerts = openAlerts.find((row) => row.severity === 'warning')?._count._all ?? 0;
    const infoAlerts = openAlerts.find((row) => row.severity === 'info')?._count._all ?? 0;
    const totalAlerts = criticalAlerts + warningAlerts + infoAlerts;

    return ok(req, {
      siteId: site.id,
      todayTop10: {
        count: todayTop10Rows.length,
        items: todayTop10Rows
      },
      alerts: {
        count: totalAlerts,
        critical: criticalAlerts,
        warning: warningAlerts,
        recent: recentAlerts
      },
      inProgress: {
        tasks: taskInProgressCount,
        outcomes: outcomeInProgressCount,
        total: taskInProgressCount + outcomeInProgressCount
      },
      yesterdayDelta: {
        scoreDelta: yesterdayOutcomes._sum.scoreDelta ?? 0,
        completed: yesterdayOutcomes._count._all ?? 0
      }
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
