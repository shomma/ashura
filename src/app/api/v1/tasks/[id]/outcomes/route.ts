import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { encodeJsonField } from '@/lib/json-fields';
import { Prisma } from '@prisma/client';
import { requireSingleSite } from '@/lib/single-site';

type Context = {
  params: {
    id: string;
  };
};

type PatchTaskOutcomeBody = {
  status?: string;
  outcome?: string;
  scoreDelta?: number;
  payload?: unknown | null;
};

export const runtime = 'nodejs';

export async function PATCH(req: Request, context: Context) {
  try {
    const body = (await req.json()) as PatchTaskOutcomeBody;
    const site = await requireSingleSite();

    const current = await prisma.taskOutcome.findFirst({
      where: { id: context.params.id, siteId: site.id }
    });
    if (!current) {
      return fail(req, 404, 'NOT_FOUND', 'task outcome not found');
    }

    const data: Prisma.TaskOutcomeUpdateInput = {};
    if (typeof body.status === 'string') {
      data.status = body.status.trim();
      if (body.status.trim() === 'done' && !current.executedAt) {
        data.executedAt = new Date();
      }
    }
    if (typeof body.outcome === 'string') data.outcome = body.outcome;
    if (typeof body.scoreDelta === 'number' && Number.isFinite(body.scoreDelta)) {
      data.scoreDelta = body.scoreDelta;
    }
    if (body.payload !== undefined) {
      data.payload = encodeJsonField(body.payload);
    }

    const updated = await prisma.taskOutcome.update({
      where: { id: current.id },
      data
    });

    return ok(req, updated);
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
