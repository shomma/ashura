import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { decodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

const ALLOWED_SORT = new Set(['score', 'updatedAt', 'dueAt']);

function normalizeStatus(raw: string | null) {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    todo: 'pending',
    doing: 'in_progress',
    review: 'blocked',
    done: 'done',
    blocked: 'blocked'
  };
  return map[value] || null;
}

function summarizeCounts(tasks: Array<{ status: string }>) {
  const summary = {
    total: tasks.length,
    todo: 0,
    doing: 0,
    review: 0,
    done: 0,
    blocked: 0
  };
  for (const task of tasks) {
    if (task.status === 'pending') summary.todo += 1;
    else if (task.status === 'in_progress') summary.doing += 1;
    else if (task.status === 'blocked') summary.review += 1;
    else if (task.status === 'done') summary.done += 1;
    else summary.blocked += 1;
  }
  return summary;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = normalizeStatus(searchParams.get('status'));
    const sort = searchParams.get('sort') || 'updatedAt';
    const limitRaw = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;

    if (sort && !ALLOWED_SORT.has(sort)) {
      return fail(req, 400, 'BAD_REQUEST', 'sort must be score, updatedAt, or dueAt');
    }

    const site = await requireSingleSite();

    const tasks = await prisma.task.findMany({
      where: {
        siteId: site.id,
        ...(statusFilter ? { status: statusFilter } : {})
      },
      include: {
        taskOutcomes: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: sort === 'score' ? [{ status: 'asc' }, { recommendedDueAt: 'asc' }, { createdAt: 'desc' }] :
        sort === 'dueAt'
          ? [{ recommendedDueAt: 'asc' }, { createdAt: 'desc' }]
          : [{ updatedAt: 'desc' }],
      take: limit
    });

    return ok(req, {
      siteId: site.id,
      items: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        action: task.action,
        source: task.source,
        opportunityId: task.opportunityId,
        dueAt: task.recommendedDueAt,
        payload: decodeJsonField(task.payload, null),
        latestOutcome: task.taskOutcomes[0]
          ? {
              id: task.taskOutcomes[0].id,
              status: task.taskOutcomes[0].status,
              outcome: task.taskOutcomes[0].outcome,
              executedAt: task.taskOutcomes[0].executedAt,
              scoreDelta: task.taskOutcomes[0].scoreDelta
            }
          : null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      })),
      summary: summarizeCounts(tasks),
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
