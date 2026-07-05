import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { RECOMMENDATION_STATUSES } from '@/lib/recommendations/constants';
import { requireSingleSite } from '@/lib/single-site';

type PatchBody = {
  status?: string;
  dueAt?: string | null;
  priority?: number;
};

export const runtime = 'nodejs';

export async function PATCH(req: Request, context: { params: { id: string } }) {
  try {
    const recommendationId = context.params.id;
    const body = (await req.json()) as PatchBody;
    const site = await requireSingleSite();

    const recommendation = await prisma.recommendation.findUnique({
      where: { id: recommendationId }
    });
    if (!recommendation || recommendation.siteId !== site.id) {
      return NextResponse.json({ error: 'recommendation not found' }, { status: 404 });
    }

    const nextStatus =
      typeof body.status === 'string' && RECOMMENDATION_STATUSES.includes(body.status as any)
        ? body.status
        : undefined;
    let nextDueAt: Date | null | undefined;
    if (body.dueAt === null) {
      nextDueAt = null;
    } else if (typeof body.dueAt === 'string') {
      const parsed = new Date(body.dueAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'dueAt is invalid' }, { status: 400 });
      }
      nextDueAt = parsed;
    } else {
      nextDueAt = undefined;
    }
    const nextPriority =
      typeof body.priority === 'number' && Number.isFinite(body.priority)
        ? Math.max(1, Math.min(99, Math.round(body.priority)))
        : undefined;

    const updated = await prisma.recommendation.update({
      where: { id: recommendation.id },
      data: {
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(nextDueAt !== undefined ? { dueAt: nextDueAt } : {}),
        ...(nextPriority !== undefined ? { priority: nextPriority } : {})
      }
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
