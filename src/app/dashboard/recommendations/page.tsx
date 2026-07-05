import prisma from '@/lib/prisma';
import {
  compareRecommendationsForDisplay,
  getRecommendationDisplayPriority
} from '@/lib/recommendations/priority';
import { ensureSingleSite } from '@/lib/single-site';
import RecommendationsClient from './RecommendationsClient';

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage() {
  const activeSite = await ensureSingleSite();
  let recommendations: Array<any> = [];

  try {
    const rows = await prisma.recommendation.findMany({
      where: { siteId: activeSite.id },
      include: {
        taskLinks: {
          include: {
            task: true
          }
        }
      },
      orderBy: [
        { priority: 'desc' },
        { dueAt: 'asc' },
        { createdAt: 'asc' },
        { title: 'asc' },
        { id: 'asc' }
      ]
    });
    recommendations = [...rows].sort(compareRecommendationsForDisplay).map((item) => ({
      id: item.id,
      siteId: item.siteId,
      dedupeKey: item.dedupeKey,
      type: item.type,
      title: item.title,
      reason: item.reason,
      evidence: item.evidence ?? null,
      priority: getRecommendationDisplayPriority(item),
      expectedImpact: item.expectedImpact,
      status: item.status,
      dueAt: item.dueAt ? item.dueAt.toISOString() : null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      taskLinks: item.taskLinks.map((link) => ({
        id: link.id,
        taskId: link.taskId,
        task: {
          id: link.task.id,
          title: link.task.title,
          status: link.task.status,
          action: link.task.action,
          createdAt: link.task.createdAt.toISOString()
        }
      }))
    }));

  } catch (error) {
    console.error('[recommendations/page] failed to load data from prisma, using empty fallback', error);
  }

  return (
    <RecommendationsClient
      activeSite={{
        id: activeSite.id,
        name: activeSite.name
      }}
      recommendations={recommendations}
    />
  );
}
