import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

type Context = {
  params: {
    postId: string;
  };
};

export const runtime = 'nodejs';

export async function GET(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();

    const opportunity = await prisma.opportunity.findFirst({
      where: { id: context.params.postId, siteId: site.id },
      include: {
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 20
        },
        signals: {
          orderBy: { observedAt: 'desc' },
          take: 20
        },
        evidences: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });
    if (!opportunity) {
      return fail(req, 404, 'NOT_FOUND', 'post not found');
    }

    return ok(req, {
      siteId: site.id,
      postId: opportunity.id,
      title: opportunity.title,
      status: opportunity.status,
      score: opportunity.score,
      confidence: opportunity.confidence,
      impact: opportunity.impact,
      summary: opportunity.summary,
      why: opportunity.why,
      healthSignals: opportunity.signals.map((signal) => ({
        id: signal.id,
        type: signal.type,
        source: signal.source,
        severity: signal.severity,
        title: signal.title,
        summary: signal.summary,
        observedAt: signal.observedAt
      })),
      evidence: opportunity.evidences.map((evidence) => ({
        id: evidence.id,
        kind: evidence.kind,
        label: evidence.label,
        value: evidence.value,
        sourceUrl: evidence.sourceUrl,
        observedAt: evidence.observedAt
      })),
      tasks: opportunity.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        action: task.action,
        source: task.source,
        dueAt: task.recommendedDueAt,
        createdAt: task.createdAt
      })),
      updatedAt: opportunity.updatedAt
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
