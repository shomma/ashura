import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

type Context = {
  params: {
    id: string;
  };
};

export const runtime = 'nodejs';

export async function POST(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();

    const task = await prisma.task.findFirst({ where: { id: context.params.id, siteId: site.id } });
    if (!task) {
      return fail(req, 404, 'NOT_FOUND', 'task not found');
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: 'in_progress' }
    });

    return ok(req, {
      id: updated.id,
      siteId: updated.siteId,
      status: updated.status,
      startedAt: new Date().toISOString()
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
