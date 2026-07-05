import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { encodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

type Context = {
  params: {
    id: string;
  };
};

type Body = {
  resultSummary?: string;
  outputPostId?: string;
  beforeAfter?: Record<string, unknown>;
};

export const runtime = 'nodejs';

export async function POST(req: Request, context: Context) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const site = await requireSingleSite();

    const task = await prisma.task.findFirst({ where: { id: context.params.id, siteId: site.id } });
    if (!task) {
      return fail(req, 404, 'NOT_FOUND', 'task not found');
    }

    const completed = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: 'done'
      }
    });

    const outcomePayload = {
      outputPostId: body.outputPostId || null,
      beforeAfter: body.beforeAfter || null
    };
    const existingOutcome = await prisma.taskOutcome.findFirst({
      where: { siteId: site.id, taskId: task.id },
      orderBy: { createdAt: 'desc' }
    });

    const scoreDelta =
      typeof body.beforeAfter === 'object' && body.beforeAfter !== null
        ? Number((body.beforeAfter as Record<string, unknown>).sessionsDelta) || 0
        : 0;

    const outcome = existingOutcome
      ? await prisma.taskOutcome.update({
          where: { id: existingOutcome.id },
          data: {
            status: 'done',
            outcome: body.resultSummary || existingOutcome.outcome || null,
            executedAt: new Date(),
            payload: encodeJsonField(outcomePayload),
            scoreDelta
          }
        })
      : await prisma.taskOutcome.create({
          data: {
            siteId: site.id,
            taskId: task.id,
            opportunityId: task.opportunityId,
            status: 'done',
            outcome: body.resultSummary || null,
            executedAt: new Date(),
            scoreDelta,
            payload: encodeJsonField(outcomePayload)
          }
        });

    return ok(req, {
      task: {
        id: completed.id,
        status: completed.status,
        updatedAt: completed.updatedAt
      },
      outcome
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
