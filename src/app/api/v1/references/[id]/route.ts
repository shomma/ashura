import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { encodeJsonArray } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

type Context = {
  params: {
    id: string;
  };
};

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((tag) => normalizeText(tag))
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

async function ensureReference(referenceId: string, siteId: string) {
  return prisma.referenceItem.findFirst({
    where: {
      id: referenceId,
      siteId
    }
  });
}

async function validateLinks(siteId: string, taskId?: string, opportunityId?: string) {
  if (taskId) {
    const task = await prisma.task.findFirst({ where: { id: taskId, siteId }, select: { id: true } });
    if (!task) throw new Error('linked task not found');
  }
  if (opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, siteId }, select: { id: true } });
    if (!opportunity) throw new Error('linked opportunity not found');
  }
}

export async function PATCH(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();
    const current = await ensureReference(context.params.id, site.id);
    if (!current) {
      return fail(req, 404, 'NOT_FOUND', 'reference not found');
    }

    const body = (await req.json()) as {
      title?: string;
      url?: string;
      note?: string;
      tags?: string[] | string;
      taskId?: string | null;
      opportunityId?: string | null;
    };

    const title = normalizeText(body.title);
    const url = normalizeText(body.url);
    const note = normalizeText(body.note);
    const tags = body.tags !== undefined ? normalizeTags(body.tags) : undefined;
    const taskId = body.taskId !== undefined ? normalizeText(body.taskId) : undefined;
    const opportunityId = body.opportunityId !== undefined ? normalizeText(body.opportunityId) : undefined;

    await validateLinks(current.siteId, taskId || undefined, opportunityId || undefined);

    const updated = await prisma.referenceItem.update({
      where: { id: current.id },
      data: {
        ...(title ? { title } : {}),
        ...(body.url !== undefined ? { url: url || null } : {}),
        ...(body.note !== undefined ? { note: note || null } : {}),
        ...(tags !== undefined ? { tags: encodeJsonArray(tags) } : {}),
        ...(taskId !== undefined ? { task: taskId ? { connect: { id: taskId } } : { disconnect: true } } : {}),
        ...(opportunityId !== undefined
          ? { opportunity: opportunityId ? { connect: { id: opportunityId } } : { disconnect: true } }
          : {})
      },
      include: {
        task: { select: { id: true, title: true } },
        opportunity: { select: { id: true, title: true } }
      }
    });

    return ok(req, updated);
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

export async function DELETE(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();
    const current = await ensureReference(context.params.id, site.id);
    if (!current) {
      return fail(req, 404, 'NOT_FOUND', 'reference not found');
    }

    await prisma.referenceItem.delete({ where: { id: current.id } });
    return ok(req, { id: current.id, deleted: true });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
