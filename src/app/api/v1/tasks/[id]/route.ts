import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { decodeJsonField, encodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';

type Context = {
  params: {
    id: string;
  };
};

type PatchTaskBody = {
  title?: string;
  status?: string;
  priority?: number;
  dueAt?: string;
  payload?: unknown | null;
};

function normalizeStatus(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    todo: 'pending',
    doing: 'in_progress',
    review: 'blocked',
    blocked: 'blocked',
    pending: 'pending',
    in_progress: 'in_progress',
    running: 'in_progress',
    done: 'done'
  };
  return map[value];
}

export async function GET(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();

    const task = await prisma.task.findFirst({
      where: { id: context.params.id, siteId: site.id },
      include: {
        opportunity: true,
        taskOutcomes: { orderBy: { createdAt: 'desc' } }
      }
    });
    if (!task) {
      return fail(req, 404, 'NOT_FOUND', 'task not found');
    }

    const recommendation =
      task.recommendationSourceId
        ? await prisma.recommendation.findUnique({
            where: { id: task.recommendationSourceId },
            select: {
              id: true,
              title: true,
              type: true,
              reason: true
            }
          })
        : null;

    return ok(req, {
      id: task.id,
      siteId: task.siteId,
      opportunityId: task.opportunityId,
      action: task.action,
      status: task.status,
      title: task.title,
      source: task.source,
      priority: 50,
      dueAt: task.recommendedDueAt,
      payload: decodeJsonField(task.payload, null),
      recommendation:
        recommendation
          ? {
              id: recommendation.id,
              title: recommendation.title,
              type: recommendation.type,
              reason: recommendation.reason
            }
        : null,
      recommendationSourceId: task.recommendationSourceId,
      recommendationType: task.recommendationType,
      recommendationReason: task.recommendationReason,
      opportunity: task.opportunity
        ? {
            id: task.opportunity.id,
            title: task.opportunity.title,
            status: task.opportunity.status
          }
        : null,
      outcomes: task.taskOutcomes.map((item) => ({
        id: item.id,
        status: item.status,
        outcome: item.outcome,
        executedAt: item.executedAt,
        scoreDelta: item.scoreDelta,
        payload: decodeJsonField(item.payload, null),
        createdAt: item.createdAt
      })),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

export async function PATCH(req: Request, context: Context) {
  try {
    const body = (await req.json().catch(() => ({}))) as PatchTaskBody;
    const site = await requireSingleSite();

    const current = await prisma.task.findFirst({ where: { id: context.params.id, siteId: site.id } });
    if (!current) {
      return fail(req, 404, 'NOT_FOUND', 'task not found');
    }

    const data: Prisma.TaskUpdateInput = {};
    if (typeof body.title === 'string' && body.title.trim().length > 0) {
      data.title = body.title.trim();
    }
    const status = normalizeStatus(body.status);
    if (body.status && !status) {
      return fail(req, 400, 'BAD_REQUEST', 'invalid status');
    }
    if (status) {
      data.status = status;
    }
    if (typeof body.dueAt === 'string') {
      data.recommendedDueAt = body.dueAt ? new Date(body.dueAt) : null;
    }
    if (body.payload !== undefined) {
      data.payload = encodeJsonField(body.payload);
    }
    if (typeof body.priority === 'number' && Number.isFinite(body.priority)) {
      const existingPayload = decodeJsonField<Record<string, unknown>>(current.payload, {});
      data.payload = encodeJsonField({
        ...existingPayload,
        priority: body.priority
      });
    }

    const updated = await prisma.task.update({
      where: { id: current.id },
      data
    });

    return ok(req, {
      id: updated.id,
      siteId: updated.siteId,
      title: updated.title,
      action: updated.action,
      status: updated.status,
      source: updated.source,
      dueAt: updated.recommendedDueAt,
      payload: decodeJsonField(updated.payload, null),
      updatedAt: updated.updatedAt
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

export async function DELETE(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();

    const task = await prisma.task.findFirst({ where: { id: context.params.id, siteId: site.id } });
    if (!task) {
      return fail(req, 404, 'NOT_FOUND', 'task not found');
    }

    await prisma.task.delete({ where: { id: task.id } });

    return ok(req, {
      id: task.id,
      status: 'deleted',
      deletedAt: new Date().toISOString()
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
