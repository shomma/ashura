import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decodeJsonField, encodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

type TaskCreateBody = {
  siteId?: string;
  title: string;
  action: string;
  source: string;
  dedupeKey: string;
  payload?: unknown | null;
  recommendationSourceId?: string | null;
  recommendationType?: string | null;
  recommendationReason?: string | null;
  recommendationEvidence?: unknown | null;
  recommendedDueAt?: string | null;
};

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const site = await requireSingleSite();

    const tasks = await prisma.task.findMany({
      where: { siteId: site.id },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({
      ok: true,
      items: tasks.map((task) => ({
        ...task,
        payload: decodeJsonField(task.payload, null),
        recommendationEvidence: decodeJsonField(task.recommendationEvidence, null)
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TaskCreateBody;
    const title = body.title?.trim();
    const action = body.action?.trim();
    const source = body.source?.trim();
    const dedupeKey = body.dedupeKey?.trim();

    if (!title || !action || !source || !dedupeKey) {
      return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
    }

    const site = await requireSingleSite();

    const existing = await prisma.task.findFirst({
      where: { siteId: site.id, dedupeKey }
    });

    const updatePayload = body.payload === null ? null : encodeJsonField(body.payload);
    const recommendationEvidence =
      body.recommendationEvidence === null ? null : encodeJsonField(body.recommendationEvidence);
    const recommendedDueAt = body.recommendedDueAt ? new Date(body.recommendedDueAt) : null;
    if (existing) {
      const updated = await prisma.task.update({
        where: { id: existing.id },
        data: {
          title,
          action,
          source,
          recommendationSourceId: body.recommendationSourceId?.trim() || null,
          recommendationType: body.recommendationType?.trim() || null,
          recommendationReason: body.recommendationReason?.trim() || null,
          ...(recommendationEvidence !== undefined
            ? { recommendationEvidence }
            : {}),
          ...(body.recommendedDueAt !== undefined ? { recommendedDueAt } : {}),
          ...(updatePayload !== undefined ? { payload: updatePayload } : {})
        }
      });
      return NextResponse.json({ ok: true, status: 'updated', task: updated });
    }

    const createPayload = body.payload === null ? null : encodeJsonField(body.payload);
    const created = await prisma.task.create({
      data: {
        siteId: site.id,
        title,
        action,
        source,
        dedupeKey,
        recommendationSourceId: body.recommendationSourceId?.trim() || null,
        recommendationType: body.recommendationType?.trim() || null,
        recommendationReason: body.recommendationReason?.trim() || null,
        ...(recommendationEvidence !== undefined
          ? { recommendationEvidence }
          : {}),
        ...(body.recommendedDueAt !== undefined ? { recommendedDueAt } : {}),
        ...(createPayload !== undefined ? { payload: createPayload } : {})
      }
    });

    return NextResponse.json({ ok: true, status: 'created', task: created });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
