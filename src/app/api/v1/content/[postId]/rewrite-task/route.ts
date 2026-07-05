import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { encodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

type Context = {
  params: {
    postId: string;
  };
};

type Body = {
  dueAt?: string;
};

export const runtime = 'nodejs';

export async function POST(req: Request, context: Context) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const site = await requireSingleSite();

    const opportunity = await prisma.opportunity.findFirst({
      where: { id: context.params.postId, siteId: site.id }
    });
    if (!opportunity) {
      return fail(req, 404, 'NOT_FOUND', 'post not found');
    }

    const dedupe = `content:${opportunity.id}:rewrite`;
    const dueAt = typeof body.dueAt === 'string' && body.dueAt.trim().length > 0 ? new Date(body.dueAt) : null;
    const payload = encodeJsonField({
      source: 'content-health',
      postId: opportunity.id,
      action: 'rewrite',
      from: 'content-rewrite-task'
    });

    const existing = await prisma.task.findFirst({
      where: { siteId: site.id, dedupeKey: dedupe }
    });
    const task = existing
        ? await prisma.task.update({
            where: { id: existing.id },
            data: {
              title: `Rewrite: ${opportunity.title}`,
              status: 'pending',
              source: 'content',
              action: 'rewrite',
              recommendedDueAt: dueAt,
              payload
            }
          })
        : await prisma.task.create({
            data: {
              siteId: site.id,
              opportunityId: opportunity.id,
            title: `Rewrite: ${opportunity.title}`,
              source: 'content',
              action: 'rewrite',
              dedupeKey: dedupe,
              status: 'pending',
              recommendedDueAt: dueAt,
              payload
            }
          });

    return ok(req, {
      siteId: site.id,
      task,
      type: 'rewrite'
    }, existing ? 200 : 201);
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
