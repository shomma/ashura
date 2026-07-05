import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decodeJsonField, encodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

type TaskUpdateBody = {
  title?: string;
  action?: string;
  status?: string;
  payload?: unknown | null;
  recommendationSourceId?: string | null;
  recommendationType?: string | null;
  recommendationReason?: string | null;
  recommendationEvidence?: unknown | null;
  recommendedDueAt?: string | null;
};

export const runtime = 'nodejs';

export async function PATCH(req: Request, context: { params: { id: string } }) {
  try {
    const taskId = context.params.id;
    const body = (await req.json()) as TaskUpdateBody;
    const site = await requireSingleSite();

    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });
    if (!task || task.siteId !== site.id) {
      return NextResponse.json({ error: 'task not found' }, { status: 404 });
    }

    const nextData: Prisma.TaskUpdateInput = {};
    if (typeof body.title === 'string') nextData.title = body.title.trim();
    if (typeof body.action === 'string') nextData.action = body.action.trim();
    if (typeof body.status === 'string') nextData.status = body.status.trim();
    if (body.payload !== undefined) {
      nextData.payload = body.payload === null ? null : encodeJsonField(body.payload);
    }
    if (body.recommendationSourceId !== undefined) {
      nextData.recommendationSourceId = body.recommendationSourceId?.trim() || null;
    }
    if (body.recommendationType !== undefined) {
      nextData.recommendationType = body.recommendationType?.trim() || null;
    }
    if (body.recommendationReason !== undefined) {
      nextData.recommendationReason = body.recommendationReason?.trim() || null;
    }
    if (body.recommendationEvidence !== undefined) {
      nextData.recommendationEvidence =
        body.recommendationEvidence === null ? null : encodeJsonField(body.recommendationEvidence);
    }
    if (body.recommendedDueAt !== undefined) {
      nextData.recommendedDueAt = body.recommendedDueAt ? new Date(body.recommendedDueAt) : null;
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: nextData
    });

    return NextResponse.json({
      ok: true,
      task: {
        ...updated,
        payload: decodeJsonField(updated.payload, null),
        recommendationEvidence: decodeJsonField(updated.recommendationEvidence, null)
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: { params: { id: string } }) {
  try {
    const taskId = context.params.id;
    const site = await requireSingleSite();

    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });
    if (!task || task.siteId !== site.id) {
      return NextResponse.json({ error: 'task not found' }, { status: 404 });
    }

    await prisma.task.delete({ where: { id: task.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
