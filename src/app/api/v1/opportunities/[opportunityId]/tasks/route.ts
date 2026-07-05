import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { mapTaskStatusDbToApi } from '@/lib/api-mapping';
import { encodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

const ALLOWED_ACTIONS = new Set(['write', 'rewrite', 'linking', 'research']);

type Context = {
  params: {
    opportunityId: string;
  };
};

type CreateTaskBody = {
  action?: string;
  dueAt?: string;
  payload?: unknown;
  source?: string;
  title?: string;
};

function normalizeAction(raw: string | undefined): string {
  const value = raw?.trim().toLowerCase();
  if (value && ALLOWED_ACTIONS.has(value)) return value;
  return 'write';
}

function buildDedupeKey(opportunityId: string, action: string) {
  return `opportunity:${opportunityId}:action:${action}`;
}

function normalizeDate(raw: string | undefined) {
  if (!raw || !raw.trim()) return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

export async function POST(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();

    const opportunity = await prisma.opportunity.findFirst({
      where: { id: context.params.opportunityId, siteId: site.id }
    });
    if (!opportunity) {
      return fail(req, 404, 'NOT_FOUND', 'opportunity not found');
    }

    const body = ((await req.json().catch(() => ({}))) || {}) as CreateTaskBody;
    const action = normalizeAction(body.action);
    const title = body.title?.trim() || `Opportunity: ${opportunity.title}`;
    const dueAt = normalizeDate(body.dueAt);
    const dedupeKey = buildDedupeKey(opportunity.id, action);

    const payload = {
      opportunityId: opportunity.id,
      opportunityTitle: opportunity.title,
      source: 'opportunity',
      action,
      type: 'opportunity',
      why: opportunity.why ?? opportunity.summary ?? '',
      impact: opportunity.impact ?? null,
      confidence: opportunity.confidence,
      score: opportunity.score,
      ...(body.payload && typeof body.payload === 'object' ? body.payload : {})
    };
    const payloadForDb = encodeJsonField(payload);

    const existingTask = await prisma.task.findFirst({
      where: { siteId: site.id, dedupeKey }
    });

    const saveData: Prisma.TaskCreateInput | Prisma.TaskUpdateInput = {
      title,
      action,
      source: body.source?.trim() || 'opportunity',
      recommendedDueAt: dueAt,
      payload: payloadForDb,
      updatedAt: new Date()
    };

    let created = false;
    let task: { id: string; siteId: string; status: string; title: string; recommendedDueAt: Date | null; createdAt: Date; updatedAt: Date };

    if (existingTask) {
      const merged = await prisma.task.update({
        where: { id: existingTask.id },
        data: saveData
      });
      task = merged;
    } else {
      const createdTask = await prisma.task.create({
        data: {
          siteId: site.id,
          opportunityId: opportunity.id,
          title,
          action,
          source: body.source?.trim() || 'opportunity',
          status: 'pending',
          dedupeKey,
          payload: payloadForDb,
          recommendedDueAt: dueAt
        }
      });

      await prisma.taskOutcome.create({
        data: {
          siteId: site.id,
          opportunityId: opportunity.id,
          taskId: createdTask.id,
          status: 'pending',
          scoreDelta: 0,
          payload: encodeJsonField({
            createdFromTaskRoute: true
          })
        }
      });

      task = createdTask;
      created = true;
    }

    await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: {
        status: opportunity.status === 'done' ? 'done' : 'tasked',
        updatedAt: new Date()
      }
    });

    return ok(
      req,
      {
        id: task.id,
        siteId: taskSiteId(task),
        opportunityId: opportunity.id,
        action,
        status: mapTaskStatusDbToApi(task.status),
        statusUi: task.status,
        title: task.title,
        dueAt: task.recommendedDueAt ? task.recommendedDueAt.toISOString() : null,
        taskHref: `/dashboard/tasks/${task.id}`,
        payload,
        created: created,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString()
      },
      created ? 201 : 200
    );
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

function taskSiteId(task: { siteId?: string | null } | null): string | null {
  if (!task) return null;
  return task.siteId ?? null;
}
